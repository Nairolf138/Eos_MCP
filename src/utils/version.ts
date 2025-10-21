import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedVersion: string | undefined;

const PACKAGE_JSON_PATH = resolve(__dirname, '../../package.json');

function readPackageJsonVersion(): string {
  const packageJsonPath = PACKAGE_JSON_PATH;
  const raw = readFileSync(packageJsonPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as { version?: unknown };
  } catch (error) {
    throw new Error(`Impossible de lire la version depuis ${packageJsonPath}: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Le contenu de ${packageJsonPath} est invalide (objet attendu).`);
  }

  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`La cle "version" est absente ou invalide dans ${packageJsonPath}.`);
  }

  return version;
}

export function getPackageVersion(): string {
  if (!cachedVersion) {
    cachedVersion = readPackageJsonVersion();
  }
  return cachedVersion;
}

export function clearPackageVersionCache(): void {
  cachedVersion = undefined;
}
