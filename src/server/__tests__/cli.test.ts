import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve } from 'node:path';
import { getPackageVersion } from '../../utils/version';
import type { AppConfig } from '../../config/index';
import { parseCliArguments, applyBootstrapOverrides } from '../index';

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
    expect(result.stdout).toContain('--verbose');
    expect(result.stdout).toContain('--json-logs');
    expect(result.stdout).toContain('--skip-osc-check');
    expect(result.stdout).toContain('--stats-interval');
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

  test('refuse une valeur invalide pour --stats-interval', () => {
    const result = runCli(['--stats-interval', 'abc']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--stats-interval');
  });
});

describe('analyse des arguments CLI', () => {
  test('active les options verbose et json-logs', () => {
    const options = parseCliArguments(['--verbose', '--json-logs']);

    expect(options.verbose).toBe(true);
    expect(options.jsonLogs).toBe(true);
    expect(options.errors).toHaveLength(0);
  });

  test('active le contournement du handshake OSC', () => {
    const options = parseCliArguments(['--skip-osc-check']);

    expect(options.skipOscCheck).toBe(true);
    expect(options.errors).toHaveLength(0);
  });

  test('convertit --stats-interval en millisecondes', () => {
    const options = parseCliArguments(['--stats-interval', '15s']);

    expect(options.statsIntervalMs).toBe(15000);
    expect(options.errors).toHaveLength(0);
  });

  test('signale une valeur invalide pour --stats-interval', () => {
    const options = parseCliArguments(['--stats-interval=foo']);

    expect(options.errors).toHaveLength(1);
    expect(options.statsIntervalMs).toBeUndefined();
  });
});

describe('override de configuration', () => {
  test('force une sortie JSON unique sur STDOUT', () => {
    const baseConfig: AppConfig = {
      mcp: { tcpPort: 3032 },
      osc: {
        remoteAddress: '127.0.0.1',
        tcpPort: 3032,
        udpOutPort: 8001,
        udpInPort: 8000,
        localAddress: '0.0.0.0'
      },
      logging: {
        level: 'info',
        format: 'pretty',
        destinations: [{ type: 'file', path: '/var/log/eos/mcp.log' }]
      },
      httpGateway: {
        trustProxy: false,
        security: {
          apiKeys: [],
          mcpTokens: [],
          ipAllowlist: [],
          allowedOrigins: [],
          rateLimit: { windowMs: 60000, max: 60 }
        }
      }
    };

    const overridden = applyBootstrapOverrides(baseConfig, { forceJsonLogs: true });

    expect(overridden.logging.format).toBe('json');
    expect(overridden.logging.destinations).toEqual([{ type: 'stdout' }]);
    expect(baseConfig.logging.destinations).toEqual([{ type: 'file', path: '/var/log/eos/mcp.log' }]);
  });
});
