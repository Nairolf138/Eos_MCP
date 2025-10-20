import { resolve } from 'node:path';
import { loadConfig, type AppConfig } from '../../config/index.js';

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
        filePath: resolve(process.cwd(), 'logs/mcp-server.log')
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
      MCP_LOG_FILE: 'var/log/eos-mcp.log'
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
    expect(config.logging.filePath).toBe(resolve(process.cwd(), 'var/log/eos-mcp.log'));
  });

  it('rejette les ports invalides avec un message explicite', () => {
    const env: NodeJS.ProcessEnv = {
      OSC_TCP_PORT: 'not-a-number'
    };

    expect(() => loadConfig(env)).toThrow(
      /OSC_TCP_PORT doit être un entier entre 1 et 65535/
    );
  });
});
