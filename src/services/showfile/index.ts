/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const DEFAULT_MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_XML_FILES = 200;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;

export interface ShowfileImportOptions {
  localPath?: string;
  uploadBase64?: string;
  uploadFilename?: string;
  allowedRoot?: string;
  operatorAuthorized: boolean;
  maxArchiveBytes?: number;
  maxUncompressedBytes?: number;
  maxEntryBytes?: number;
  maxXmlFiles?: number;
}

export interface ShowfileEntryRecord {
  file: string;
  tag: string;
  attributes: Record<string, string>;
  text?: string;
}

export interface ShowfileMetadata {
  patch: ShowfileEntryRecord[];
  groups: ShowfileEntryRecord[];
  labels: ShowfileEntryRecord[];
  cues: ShowfileEntryRecord[];
  palettes: ShowfileEntryRecord[];
  fixtures: ShowfileEntryRecord[];
}

export interface ShowfileImportResult extends ShowfileMetadata {
  import_id: string;
  source: 'showfile';
  live: false;
  filename: string;
  imported_at: string;
  files_scanned: string[];
  warnings: string[];
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

const imports = new Map<string, ShowfileImportResult>();
let latestImportId: string | null = null;

function ensureEsf3dFilename(filename: string): void {
  if (path.extname(filename).toLowerCase() !== '.esf3d') {
    throw new Error('Le fichier showfile doit utiliser l extension .esf3d.');
  }
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveAuthorisedLocalPath(localPath: string, allowedRoot?: string): string {
  const resolvedPath = path.resolve(localPath);
  ensureEsf3dFilename(resolvedPath);

  if (!allowedRoot) {
    throw new Error('allowedRoot est requis pour importer un chemin local.');
  }

  const resolvedRoot = path.resolve(allowedRoot);
  if (!isWithinRoot(resolvedPath, resolvedRoot)) {
    throw new Error('Le chemin local n est pas dans le repertoire autorise.');
  }

  return resolvedPath;
}

async function readInputArchive(options: ShowfileImportOptions): Promise<{ buffer: Buffer; filename: string }> {
  if (!options.operatorAuthorized) {
    throw new Error('Autorisation operateur explicite requise pour importer un showfile .esf3d.');
  }

  const hasLocalPath = typeof options.localPath === 'string' && options.localPath.trim().length > 0;
  const hasUpload = typeof options.uploadBase64 === 'string' && options.uploadBase64.trim().length > 0;
  if (hasLocalPath === hasUpload) {
    throw new Error('Fournissez exactement un localPath autorise ou un uploadBase64 controle.');
  }

  const maxArchiveBytes = options.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES;
  if (hasLocalPath) {
    const resolvedPath = resolveAuthorisedLocalPath(options.localPath as string, options.allowedRoot);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Le chemin local autorise ne pointe pas vers un fichier.');
    }
    if (stat.size > maxArchiveBytes) {
      throw new Error(`Archive trop volumineuse (${stat.size} octets, limite ${maxArchiveBytes}).`);
    }
    return { buffer: await fs.readFile(resolvedPath), filename: path.basename(resolvedPath) };
  }

  const filename = options.uploadFilename ?? 'upload.esf3d';
  ensureEsf3dFilename(filename);
  const buffer = Buffer.from(options.uploadBase64 as string, 'base64');
  if (buffer.length === 0) {
    throw new Error('Upload .esf3d vide.');
  }
  if (buffer.length > maxArchiveBytes) {
    throw new Error(`Upload trop volumineux (${buffer.length} octets, limite ${maxArchiveBytes}).`);
  }
  return { buffer, filename: path.basename(filename) };
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('Archive ZIP invalide: fin de repertoire central introuvable.');
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Archive ZIP invalide: entree de repertoire central corrompue.');
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    entries.push({ name, compressedSize, uncompressedSize, compressionMethod, localHeaderOffset });
    offset = nameEnd + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function resolveSafeEntryPath(tempDir: string, entryName: string): string {
  if (entryName.includes('\\') || path.posix.isAbsolute(entryName) || /^[a-z]:/i.test(entryName)) {
    throw new Error(`Chemin ZIP interdit: ${entryName}`);
  }
  const normalised = path.posix.normalize(entryName);
  if (normalised === '.' || normalised.startsWith('../') || normalised === '..') {
    throw new Error(`Protection zip-slip: entree interdite ${entryName}`);
  }
  const destination = path.resolve(tempDir, normalised);
  if (!isWithinRoot(destination, tempDir)) {
    throw new Error(`Protection zip-slip: entree hors repertoire temporaire ${entryName}`);
  }
  return destination;
}

function readZipEntryData(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error(`Archive ZIP invalide: en-tete local introuvable pour ${entry.name}.`);
  }
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraFieldLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new Error(`Archive ZIP invalide: donnees tronquees pour ${entry.name}.`);
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    return Buffer.from(compressed);
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Methode de compression ZIP non supportee (${entry.compressionMethod}) pour ${entry.name}.`);
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of raw.matchAll(pattern)) {
    attributes[match[1]] = decodeXmlEntities(match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normaliseText(value: string): string | undefined {
  const text = decodeXmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  return text.length > 0 ? text.slice(0, 500) : undefined;
}

function classifyRecord(record: ShowfileEntryRecord, metadata: ShowfileMetadata): void {
  const haystack = `${record.file} ${record.tag} ${Object.keys(record.attributes).join(' ')} ${Object.values(record.attributes).join(' ')}`.toLowerCase();

  if (/\b(patch|chan|channel|address|universe|dmx)\b/.test(haystack)) {
    metadata.patch.push(record);
  }
  if (/\b(group|grp)\b/.test(haystack)) {
    metadata.groups.push(record);
  }
  if (/\b(label|name)\b/.test(haystack) || record.text) {
    metadata.labels.push(record);
  }
  if (/\b(cue|cuelist|cue_list)\b/.test(haystack)) {
    metadata.cues.push(record);
  }
  if (/\b(palette|preset|intensitypalette|focuspalette|colorpalette|colourpalette|beampalette|ip|fp|cp|bp)\b/.test(haystack)) {
    metadata.palettes.push(record);
  }
  if (/\b(fixture|fixturetype|personality|manufacturer|model|mode)\b/.test(haystack)) {
    metadata.fixtures.push(record);
  }
}

function trimMetadata(metadata: ShowfileMetadata, maxRecordsPerCategory = 1000): ShowfileMetadata {
  return {
    patch: metadata.patch.slice(0, maxRecordsPerCategory),
    groups: metadata.groups.slice(0, maxRecordsPerCategory),
    labels: metadata.labels.slice(0, maxRecordsPerCategory),
    cues: metadata.cues.slice(0, maxRecordsPerCategory),
    palettes: metadata.palettes.slice(0, maxRecordsPerCategory),
    fixtures: metadata.fixtures.slice(0, maxRecordsPerCategory)
  };
}

export function extractMetadataFromXml(file: string, xml: string): ShowfileMetadata {
  const metadata: ShowfileMetadata = { patch: [], groups: [], labels: [], cues: [], palettes: [], fixtures: [] };
  const selfClosingPattern = /<([A-Za-z_][\w:.-]*)(\s[^<>]*?)\/>/g;
  const pairedPattern = /<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?>([^<>]{0,1000})<\/\1>/g;

  for (const pattern of [selfClosingPattern, pairedPattern]) {
    for (const match of xml.matchAll(pattern)) {
      const tag = match[1];
      const attributes = parseAttributes(match[2] ?? '');
      const text = normaliseText(match[3] ?? '');
      if (Object.keys(attributes).length === 0 && !text) {
        continue;
      }
      classifyRecord({ file, tag, attributes, ...(text ? { text } : {}) }, metadata);
    }
  }

  return trimMetadata(metadata);
}

function mergeMetadata(target: ShowfileMetadata, source: ShowfileMetadata): void {
  target.patch.push(...source.patch);
  target.groups.push(...source.groups);
  target.labels.push(...source.labels);
  target.cues.push(...source.cues);
  target.palettes.push(...source.palettes);
  target.fixtures.push(...source.fixtures);
}

async function extractAndParseArchive(buffer: Buffer, tempDir: string, options: ShowfileImportOptions): Promise<{
  metadata: ShowfileMetadata;
  filesScanned: string[];
  warnings: string[];
}> {
  const maxUncompressedBytes = options.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
  const maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxXmlFiles = options.maxXmlFiles ?? DEFAULT_MAX_XML_FILES;
  const entries = readZipEntries(buffer);
  const metadata: ShowfileMetadata = { patch: [], groups: [], labels: [], cues: [], palettes: [], fixtures: [] };
  const filesScanned: string[] = [];
  const warnings: string[] = [];
  let totalUncompressed = 0;

  for (const entry of entries) {
    if (entry.name.endsWith('/')) {
      continue;
    }
    const destination = resolveSafeEntryPath(tempDir, entry.name);
    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > maxUncompressedBytes) {
      throw new Error(`Archive ZIP trop volumineuse apres extraction (limite ${maxUncompressedBytes}).`);
    }
    if (entry.uncompressedSize > maxEntryBytes) {
      warnings.push(`Fichier ignore car trop volumineux: ${entry.name}`);
      continue;
    }
    if (path.extname(entry.name).toLowerCase() !== '.xml') {
      continue;
    }
    if (filesScanned.length >= maxXmlFiles) {
      warnings.push(`Limite de fichiers XML atteinte (${maxXmlFiles}); fichiers restants ignores.`);
      break;
    }

    const data = readZipEntryData(buffer, entry);
    if (data.length !== entry.uncompressedSize) {
      throw new Error(`Taille ZIP inattendue pour ${entry.name}.`);
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, data, { mode: 0o600 });
    filesScanned.push(entry.name);
    mergeMetadata(metadata, extractMetadataFromXml(entry.name, data.toString('utf8')));
  }

  return { metadata: trimMetadata(metadata), filesScanned, warnings };
}

export async function importShowfile(options: ShowfileImportOptions): Promise<ShowfileImportResult> {
  const input = await readInputArchive(options);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-showfile-'));

  try {
    const { metadata, filesScanned, warnings } = await extractAndParseArchive(input.buffer, tempDir, options);
    const result: ShowfileImportResult = {
      import_id: randomUUID(),
      source: 'showfile',
      live: false,
      filename: input.filename,
      imported_at: new Date().toISOString(),
      files_scanned: filesScanned,
      warnings,
      ...metadata
    };
    imports.set(result.import_id, result);
    latestImportId = result.import_id;
    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function getShowfileImport(importId?: string): ShowfileImportResult {
  const resolvedImportId = importId ?? latestImportId;
  if (!resolvedImportId) {
    throw new Error('Aucun showfile .esf3d importe. Appelez eos_showfile_import auparavant.');
  }
  const result = imports.get(resolvedImportId);
  if (!result) {
    throw new Error(`Import showfile introuvable: ${resolvedImportId}`);
  }
  return result;
}

export function clearShowfileImportsForTests(): void {
  imports.clear();
  latestImportId = null;
}
