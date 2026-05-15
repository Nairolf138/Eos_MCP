/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { deflateRawSync } from 'node:zlib';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clearShowfileImportsForTests, getShowfileImport, importShowfile } from '../index';

interface ZipInputEntry {
  name: string;
  data: string;
}

function createZip(entries: ZipInputEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data, 'utf8');
    const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);

    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe('showfile service', () => {
  beforeEach(() => clearShowfileImportsForTests());

  it('imports an authorised .esf3d upload as offline showfile metadata', async () => {
    const archive = createZip([
      {
        name: 'ShowData.xml',
        data: '<Show><Patch Channel="1" Universe="1" Address="101" Label="Key" Fixture="Source Four"/><Group Number="1" Label="Front"/><Cue Number="1" Label="Open"/><ColorPalette Number="11" Label="Red"/></Show>'
      }
    ]);

    const result = await importShowfile({
      operatorAuthorized: true,
      uploadFilename: 'show.esf3d',
      uploadBase64: archive.toString('base64')
    });

    expect(result.source).toBe('showfile');
    expect(result.live).toBe(false);
    expect(result.files_scanned).toEqual(['ShowData.xml']);
    expect(result.patch).toHaveLength(1);
    expect(result.groups).toHaveLength(1);
    expect(result.cues).toHaveLength(1);
    expect(result.palettes).toHaveLength(1);
    expect(result.fixtures).toHaveLength(1);
    expect(getShowfileImport(result.import_id).filename).toBe('show.esf3d');
  });

  it('requires explicit operator authorisation', async () => {
    const archive = createZip([{ name: 'ShowData.xml', data: '<Patch Channel="1" />' }]);

    await expect(importShowfile({
      operatorAuthorized: false,
      uploadFilename: 'show.esf3d',
      uploadBase64: archive.toString('base64')
    })).rejects.toThrow(/Autorisation operateur/);
  });

  it('rejects zip-slip entries before extracting XML', async () => {
    const archive = createZip([{ name: '../ShowData.xml', data: '<Patch Channel="1" />' }]);

    await expect(importShowfile({
      operatorAuthorized: true,
      uploadFilename: 'show.esf3d',
      uploadBase64: archive.toString('base64')
    })).rejects.toThrow(/zip-slip|Chemin ZIP/);
  });

  it('accepts a local path only inside the authorised root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-showfile-test-'));
    try {
      const archivePath = path.join(root, 'local.esf3d');
      await fs.writeFile(archivePath, createZip([{ name: 'Patch.xml', data: '<Patch Channel="2" Label="Wash" />' }]));

      const result = await importShowfile({ operatorAuthorized: true, localPath: archivePath, allowedRoot: root });

      expect(result.patch[0].attributes.Channel).toBe('2');
      await expect(importShowfile({
        operatorAuthorized: true,
        localPath: archivePath,
        allowedRoot: path.dirname(root)
      })).resolves.toBeDefined();
      await expect(importShowfile({
        operatorAuthorized: true,
        localPath: archivePath,
        allowedRoot: path.join(root, 'other')
      })).rejects.toThrow(/repertoire autorise/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
