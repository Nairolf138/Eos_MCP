/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REQUIRED_LICENSE = 'AGPL-3.0-only';
const ROOT = process.cwd();
const HEADER_LINE_LIMIT = 20;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.cache'
]);

interface LicenseIssue {
  path: string;
  license: string;
}

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (entry.isFile() && statSync(fullPath).size <= 2_000_000) {
      files.push(fullPath);
    }
  }

  return files;
}

function headerSection(content: string): string {
  return content.split(/\r?\n/, HEADER_LINE_LIMIT).join('\n');
}

function findHeaderLicense(content: string): string | null {
  const match = headerSection(content).match(/SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)/);
  return match?.[1] ?? null;
}

function normaliseHeader(content: string): string {
  const lines = content.split(/\r?\n/);
  const limit = Math.min(lines.length, HEADER_LINE_LIMIT);

  for (let index = 0; index < limit; index += 1) {
    if (lines[index]?.includes('SPDX-License-Identifier:')) {
      lines[index] = lines[index]!.replace(
        /SPDX-License-Identifier:\s*[A-Za-z0-9.+-]+/,
        `SPDX-License-Identifier: ${REQUIRED_LICENSE}`
      );
      break;
    }
  }

  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  return lines.join(newline);
}

const mode = process.argv.includes('--fix') ? 'fix' : 'check';
const issues: LicenseIssue[] = [];
let fixed = 0;

for (const filePath of walk(ROOT)) {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const license = findHeaderLicense(content);
  if (!license || license === REQUIRED_LICENSE) {
    continue;
  }

  const displayPath = relative(ROOT, filePath).replace(/\\/g, '/');

  if (mode === 'fix') {
    writeFileSync(filePath, normaliseHeader(content), 'utf8');
    fixed += 1;
    console.log(`fixed ${displayPath}: ${license} -> ${REQUIRED_LICENSE}`);
  } else {
    issues.push({ path: displayPath, license });
  }
}

if (mode === 'fix') {
  console.log(`SPDX normalisation complete: ${fixed} file(s) updated.`);
  process.exit(0);
}

if (issues.length > 0) {
  console.error(`Found ${issues.length} file(s) with a non-project SPDX header:`);
  for (const issue of issues) {
    console.error(`- ${issue.path}: ${issue.license} (expected ${REQUIRED_LICENSE})`);
  }
  process.exit(1);
}

console.log(`SPDX header check passed: all detected project headers use ${REQUIRED_LICENSE}.`);
