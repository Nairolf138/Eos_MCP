import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve } from 'node:path';
import { getPackageVersion } from '../../utils/version';

type CliResult = SpawnSyncReturns<string>;

const projectRoot = resolve(__dirname, '../../..');
const entryPoint = resolve(projectRoot, 'src/server/index.ts');
const tsNodeRegister = require.resolve('ts-node/register/transpile-only');

function runCli(args: string[], envOverrides: NodeJS.ProcessEnv = {}): CliResult {
  const result = spawnSync(
    process.execPath,
    ['-r', tsNodeRegister, entryPoint, ...args],
    {
      cwd: projectRoot,
      env: { ...process.env, ...envOverrides },
      encoding: 'utf-8'
    }
  );

  return result;
}

describe('CLI du serveur MCP', () => {
  test('affiche l\'aide et quitte avec --help', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage : node');
    expect(result.stdout).toContain('--list-tools');
    expect(result.stderr).toBe('');
  });

  test('affiche la version du package avec --version', () => {
    const version = getPackageVersion();
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(version);
    expect(result.stderr).toBe('');
  });

  test('liste les outils avec --list-tools', () => {
    const result = runCli(['--list-tools']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Outils MCP disponibles');
    expect(result.stdout).toMatch(/- ping/);
    expect(result.stderr).toBe('');
  });

  test('valide la configuration avec --check-config', () => {
    const result = runCli(['--check-config']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Configuration valide.');
    expect(result.stderr).toBe('');
  });

  test('signale une erreur de configuration avec --check-config', () => {
    const result = runCli(['--check-config'], { MCP_TCP_PORT: 'abc' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Configuration invalide :');
    expect(result.stderr).toContain('MCP_TCP_PORT');
  });
});
