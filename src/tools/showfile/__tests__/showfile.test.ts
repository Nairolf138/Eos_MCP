/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { deflateRawSync } from 'node:zlib';
import showfileTools from '../index';
import { clearShowfileImportsForTests } from '../../../services/showfile/index';

function createZip(name: string, data: string): Buffer {
  const fileName = Buffer.from(name, 'utf8');
  const uncompressed = Buffer.from(data, 'utf8');
  const compressed = deflateRawSync(uncompressed);
  const local = Buffer.alloc(30 + fileName.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(uncompressed.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  fileName.copy(local, 30);

  const central = Buffer.alloc(46 + fileName.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(uncompressed.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  fileName.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + compressed.length, 16);

  return Buffer.concat([local, compressed, central, end]);
}

describe('showfile tools', () => {
  beforeEach(() => clearShowfileImportsForTests());

  it('imports and reads groups with source=showfile/live=false markers', async () => {
    const importTool = showfileTools.find((tool) => tool.name === 'eos_showfile_import');
    const listGroupsTool = showfileTools.find((tool) => tool.name === 'eos_showfile_list_groups');
    expect(importTool).toBeDefined();
    expect(listGroupsTool).toBeDefined();

    const archive = createZip('ShowData.xml', '<Group Number="3" Label="Backlight" />');
    const imported = await importTool?.handler({
      operator_authorized: true,
      uploadFilename: 'offline.esf3d',
      uploadBase64: archive.toString('base64')
    }, undefined);

    expect(imported?.structuredContent?.source).toBe('showfile');
    expect(imported?.structuredContent?.live).toBe(false);
    expect(imported?.structuredContent?.counts).toMatchObject({ groups: 1 });

    const groups = await listGroupsTool?.handler({}, undefined);
    expect(groups?.structuredContent?.source).toBe('showfile');
    expect(groups?.structuredContent?.live).toBe(false);
    expect(groups?.structuredContent?.groups).toEqual([
      { file: 'ShowData.xml', tag: 'Group', attributes: { Number: '3', Label: 'Backlight' } }
    ]);
  });
});
