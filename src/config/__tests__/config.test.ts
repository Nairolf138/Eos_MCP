import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getConfig,
  loadConfig,
  resetConfigCacheForTesting,
  type AppConfig
} from '../../config/index';
import { initialiseEnv } from '../env';

describe('configuration', () => {
  it('fournit des valeurs par défaut cohérentes lorsque aucune variable est définie', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const expected: AppConfig = {
      mcp: {
        tcpPort: undefined
      },
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
        destinations: [
          {
            type: 'stdout'
          },
          {
            type: 'file',
            path: resolve(process.cwd(), 'logs/mcp-server.log')
          }
        ]
      },
      httpGateway: {
        publicUrl: undefined,
        security: {
          apiKeys: [],
          mcpTokens: ['change-me'],
          ipAllowlist: [],
          allowedOrigins: [],
          rateLimit: { windowMs: 60000, max: 60 }
        }
      }
    };

    expect(config).toEqual(expected);
  });

  it('valide et normalise les variables fournies', () => {
    const env: NodeJS.ProcessEnv = {
      MCP_TCP_PORT: '9000',
      OSC_REMOTE_ADDRESS: '192.168.1.10',
      OSC_TCP_PORT: '4000',
      OSC_UDP_OUT_PORT: '4001',
      OSC_UDP_IN_PORT: '4002',
      OSC_LOCAL_ADDRESS: '192.168.1.2',
      LOG_LEVEL: 'DEBUG',
      MCP_LOG_FILE: 'var/log/eos-mcp.log',
      LOG_DESTINATIONS: 'stdout,file',
      MCP_HTTP_API_KEYS: 'admin-key',
      MCP_HTTP_MCP_TOKENS: 'token-one,token-two',
      MCP_HTTP_IP_ALLOWLIST: '127.0.0.1,::1',
      MCP_HTTP_ALLOWED_ORIGINS: 'http://localhost',
      MCP_HTTP_PUBLIC_URL: 'https://public.example/mcp/',
      MCP_HTTP_RATE_LIMIT_WINDOW: '120000',
      MCP_HTTP_RATE_LIMIT_MAX: '10'
    };

    const config = loadConfig(env);

    expect(config.mcp.tcpPort).toBe(9000);
    expect(config.osc).toEqual({
      remoteAddress: '192.168.1.10',
      tcpPort: 4000,
      udpOutPort: 4001,
      udpInPort: 4002,
      localAddress: '192.168.1.2'
    });
    expect(config.logging.level).toBe('debug');
    expect(config.logging.format).toBe('pretty');
    expect(config.logging.destinations).toEqual([
      { type: 'stdout' },
      { type: 'file', path: resolve(process.cwd(), 'var/log/eos-mcp.log') }
    ]);
    expect(config.httpGateway.security).toEqual({
      apiKeys: ['admin-key'],
      mcpTokens: ['token-one', 'token-two'],
      ipAllowlist: ['127.0.0.1', '::1'],
      allowedOrigins: ['http://localhost'],
      rateLimit: { windowMs: 120000, max: 10 }
    });
    expect(config.httpGateway.publicUrl).toBe('https://public.example/mcp');
  });

  it('rejette les ports invalides avec un message explicite', () => {
    const env: NodeJS.ProcessEnv = {
      OSC_TCP_PORT: 'not-a-number'
    };

    expect(() => loadConfig(env)).toThrow(
      /OSC_TCP_PORT doit être un entier entre 1 et 65535/
    );
  });

  it('permet de configurer une destination transport avec options', () => {
    const env: NodeJS.ProcessEnv = {
      LOG_DESTINATIONS: 'transport,stdout',
      LOG_TRANSPORT_TARGET: 'pino-syslog',
      LOG_TRANSPORT_OPTIONS: '{"host":"logs.internal","port":1514}',
      LOG_PRETTY: 'false',
      NODE_ENV: 'production'
    };

    const config = loadConfig(env);

    expect(config.logging.format).toBe('json');
    expect(config.logging.destinations).toEqual([
      {
        type: 'transport',
        target: 'pino-syslog',
        options: { host: 'logs.internal', port: 1514 }
      },
      { type: 'stdout' }
    ]);
  });

  it('permet de désactiver STDOUT explicitement en développement', () => {
    const env: NodeJS.ProcessEnv = {
      LOG_DESTINATIONS: 'file'
    };

    const config = loadConfig(env);

    expect(config.logging.destinations).toEqual([
      { type: 'file', path: resolve(process.cwd(), 'logs/mcp-server.log') }
    ]);
  });

  describe('initialiseEnv', () => {
    const envVariableName = 'MCP_HTTP_API_KEYS';

    let originalEnvValue: string | undefined;
    let cwdSpy: jest.SpyInstance<string, []>;
    let tempDir: string;

    beforeEach(() => {
      originalEnvValue = process.env[envVariableName];
      delete process.env[envVariableName];

      tempDir = mkdtempSync(join(tmpdir(), 'eos-mcp-env-test-'));
      writeFileSync(join(tempDir, '.env'), `${envVariableName}=from-env-file\n`, 'utf8');
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(tempDir);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });

      if (originalEnvValue === undefined) {
        delete process.env[envVariableName];
      } else {
        process.env[envVariableName] = originalEnvValue;
      }
    });

    it('charge automatiquement les variables définies dans un fichier .env', () => {
      initialiseEnv();

      expect(process.env[envVariableName]).toBe('from-env-file');
    });
  });

  describe('getConfig', () => {
    let originalOscTcpPort: string | undefined;

    beforeEach(() => {
      originalOscTcpPort = process.env.OSC_TCP_PORT;
      resetConfigCacheForTesting();
    });

    afterEach(() => {
      resetConfigCacheForTesting();
      if (originalOscTcpPort === undefined) {
        delete process.env.OSC_TCP_PORT;
      } else {
        process.env.OSC_TCP_PORT = originalOscTcpPort;
      }
    });

    it('renvoie le message agrege en cas de configuration invalide', () => {
      process.env.OSC_TCP_PORT = 'not-a-number';

      expect(() => getConfig()).toThrow(
        "Configuration invalide:\n- La variable d'environnement OSC_TCP_PORT doit être un entier entre 1 et 65535 (reçu: not-a-number)."
      );
    });
  });
});
