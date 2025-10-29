import type { AppConfig } from '../../config';
import { validateMcpTokenConfiguration } from '../index';

function createConfig(options?: {
  tcpPort?: number | null;
  tokens?: readonly string[];
}): AppConfig {
  const { tcpPort = 3032, tokens = ['secure-token'] as const } = options ?? {};
  const mcpConfig: AppConfig['mcp'] =
    tcpPort === null || tcpPort === undefined ? {} : { tcpPort };

  return {
    mcp: mcpConfig,
    osc: {
      remoteAddress: '127.0.0.1',
      tcpPort: 3032,
      udpOutPort: 8001,
      udpInPort: 8000,
      localAddress: '0.0.0.0'
    },
    logging: {
      level: 'info',
      format: 'json',
      destinations: []
    },
    httpGateway: {
      trustProxy: false,
      security: {
        apiKeys: [],
        mcpTokens: Array.from(tokens),
        ipAllowlist: [],
        allowedOrigins: [],
        rateLimit: { windowMs: 60000, max: 60 }
      }
    }
  } satisfies AppConfig;
}

describe('validateMcpTokenConfiguration', () => {
  it("signale un avertissement en developpement lorsque le jeton par defaut est conserve", () => {
    const config = createConfig({ tokens: ['change-me'] });
    const result = validateMcpTokenConfiguration(config, {
      NODE_ENV: 'development'
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe('warn');
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('MCP_HTTP_MCP_TOKENS');
  });

  it('echoue en production lorsque la passerelle est activee sans jeton securise', () => {
    const config = createConfig({ tokens: [] });
    const result = validateMcpTokenConfiguration(config, {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe('error');
    expect(result.message).toContain('MCP_HTTP_MCP_TOKENS');
  });

  it('ignore la validation lorsque le port MCP n\'est pas defini', () => {
    const config = createConfig({ tcpPort: null, tokens: ['change-me'] });
    const result = validateMcpTokenConfiguration(config, {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe('ok');
  });

  it('accepte des jetons valides meme si le jeton par defaut reste present', () => {
    const config = createConfig({ tokens: ['change-me', 'secret-123'] });
    const result = validateMcpTokenConfiguration(config, {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe('ok');
  });
});
