import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cachedVersion: string | undefined;
let cachedPackageJson: Record<string, unknown> | undefined;

const PACKAGE_JSON_PATH = resolve(__dirname, '../../package.json');

function readPackageJson(): Record<string, unknown> {
  if (cachedPackageJson) {
    return cachedPackageJson;
  }

  const packageJsonPath = PACKAGE_JSON_PATH;
  const raw = readFileSync(packageJsonPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Impossible de lire la version depuis ${packageJsonPath}: ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Le contenu de ${packageJsonPath} est invalide (objet attendu).`);
  }

  cachedPackageJson = parsed as Record<string, unknown>;
  return cachedPackageJson;
}

function readPackageJsonVersion(): string {
  const version = readPackageJson().version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`La cle "version" est absente ou invalide dans ${PACKAGE_JSON_PATH}.`);
  }

  return version;
}

function extractDependencyVersion(name: string): string | null {
  const packageJson = readPackageJson();
  const dependencies = packageJson.dependencies;

  if (!dependencies || typeof dependencies !== 'object') {
    return null;
  }

  const value = (dependencies as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function extractNodeRuntimeTarget(): string | null {
  const packageJson = readPackageJson();
  const scripts = packageJson.scripts;

  if (!scripts || typeof scripts !== 'object') {
    return null;
  }

  const packageScript = (scripts as Record<string, unknown>).package;
  if (typeof packageScript !== 'string') {
    return null;
  }

  const targetMatch = packageScript.match(/--targets\s+([^\s]+)/);
  return targetMatch?.[1] ?? null;
}

export function getPackageVersion(): string {
  if (!cachedVersion) {
    cachedVersion = readPackageJsonVersion();
  }
  return cachedVersion;
}

export function getServerCompatibility(): {
  mcp_sdk: string | null;
  osc_protocol: string;
  runtime_target: string | null;
} {
  return {
    mcp_sdk: extractDependencyVersion('@modelcontextprotocol/sdk'),
    osc_protocol: 'ETCOSC',
    runtime_target: extractNodeRuntimeTarget()
  };
}

export function clearPackageVersionCache(): void {
  cachedVersion = undefined;
  cachedPackageJson = undefined;
}
