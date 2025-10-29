import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { createHttpGateway, type HttpGateway } from '../httpGateway';
import { ToolRegistry } from '../toolRegistry';
import type { ToolDefinition } from '../../tools/types';
import {
  OscConnectionStateProvider,
  type TransportStatus
} from '../../services/osc/index';

declare const fetch: typeof globalThis.fetch;

const tool: ToolDefinition = {
  name: 'echo_test',
  config: {
    description: 'Echo test tool',
    inputSchema: {
      text: z.string().optional()
    }
  },
  handler: async (args) => ({
    content: [
      {
        type: 'text',
        text: `echo:${JSON.stringify(args ?? {})}`
      }
    ]
  })
};

const createSessionServer = (): McpServer => {
  const instance = new McpServer({
    name: 'test-http-session',
    version: '0.0.0-test'
  });
  const sessionRegistry = new ToolRegistry(instance);
  sessionRegistry.register(tool);
  return instance;
};

describe('HttpGateway integration', () => {
  let stdioServer: McpServer;
  let registry: ToolRegistry;
  let gateway: HttpGateway;
  let baseUrl: string;
  let connectionState: OscConnectionStateProvider;

  const updateTransportStatus = (
    type: TransportStatus['type'],
    state: TransportStatus['state']
  ): void => {
    const timestamp = Date.now();
    connectionState.setStatus({
      type,
      state,
      lastHeartbeatAckAt: state === 'connected' ? timestamp : null,
      lastHeartbeatSentAt: state === 'connected' ? timestamp : null,
      consecutiveFailures: state === 'connected' ? 0 : 1
    });
  };

  beforeAll(async () => {
    stdioServer = new McpServer({
      name: 'test-server-stdio',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(stdioServer);
    registry.register(tool);

    connectionState = new OscConnectionStateProvider();
    updateTransportStatus('tcp', 'connected');
    updateTransportStatus('udp', 'connected');

    gateway = createHttpGateway(registry, {
      port: 0,
      oscConnectionProvider: connectionState,
      serverFactory: () => createSessionServer()
    });

    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    updateTransportStatus('tcp', 'connected');
    updateTransportStatus('udp', 'connected');
  });

  afterAll(async () => {
    await gateway.stop();
    await stdioServer.close();
  });

  async function initializeSession(id: string = 'init-1'): Promise<{
    sessionId: string;
    payload: Record<string, unknown>;
  }> {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'jest-client',
            version: '0.0.1'
          }
        }
      })
    });

    expect(response.status).toBe(200);
    const sessionId = response.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    const payload = (await response.json()) as Record<string, unknown>;
    return { sessionId: sessionId!, payload };
  }

  test('performs JSON-RPC initialization and returns session information', async () => {
    const { sessionId, payload } = await initializeSession();
    const result = payload.result as
      | {
          serverInfo?: { name?: string };
          protocolVersion?: string;
        }
      | undefined;
    expect(result).toBeDefined();
    expect(result?.serverInfo?.name).toBe('test-http-session');
    expect(result?.protocolVersion).toBeDefined();

    // Close the session explicitly to avoid leaking connections
    const closeResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION
      }
    });
    expect(closeResponse.status).toBe(200);
  });

  test('executes tool via JSON-RPC tools/call', async () => {
    const { sessionId } = await initializeSession('init-call');

    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: tool.name,
          arguments: { text: 'http' }
        }
      })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { result?: { content?: Array<{ text?: string }> } };
    expect(payload.result?.content?.[0]?.text).toBe('echo:{"text":"http"}');
  });

  test('returns parse error on invalid JSON payload', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: '{'
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: { code?: number } };
    expect(payload.error?.code).toBe(-32700);
  });

  test('rejects non-initialize requests without session id', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'missing-session',
        method: 'tools/call',
        params: {
          name: tool.name,
          arguments: {}
        }
      })
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: { code?: number } };
    expect(payload.error?.code).toBe(-32600);
  });

  test('exposes manifest with resolved HTTP transport URL', async () => {
    const response = await fetch(`${baseUrl}/manifest.json`, {
      headers: {
        'content-type': 'application/json'
      }
    });

    expect(response.status).toBe(200);
    const manifest = (await response.json()) as {
      mcp?: {
        servers?: Array<{
          server?: { transport?: { url?: string; type?: string }; endpoints?: Record<string, string> };
        }>;
      };
    };

    const transport = manifest.mcp?.servers?.[0]?.server?.transport;
    expect(transport).toBeDefined();
    const expectedPublicUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    expect(transport?.type).toBe('http');
    expect(transport?.url).toBe(expectedPublicUrl);

    const endpoints = manifest.mcp?.servers?.[0]?.server?.endpoints ?? {};
    expect(endpoints.manifest).toBe('manifest.json');
    expect(endpoints.health).toBe('health');
    expect(endpoints.mcp).toBe('mcp');
  });

  test('reports health status via HTTP GET', async () => {
    const { sessionId } = await initializeSession('init-health');

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'content-type': 'application/json'
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.status).toBe('ok');
    expect(typeof payload.uptimeMs).toBe('number');
    expect(payload.toolCount).toBe(1);
    expect(payload.transportActive).toBe(true);

    const mcp = payload.mcp as
      | {
          http: { status: string; sessionCount: number; startedAt: number | null; lastActivityAt: number | null };
        }
      | undefined;
    expect(mcp).toBeDefined();
    expect(mcp?.http.status).toBe('listening');
    expect(typeof mcp?.http.sessionCount).toBe('number');

    const osc = payload.osc as
      | {
          status: string;
          transports: { tcp: { state: string }; udp: { state: string } };
        }
      | undefined;
    expect(osc).toBeDefined();
    expect(osc?.status).toBe('online');
    expect(osc?.transports.tcp.state).toBe('connected');
    expect(osc?.transports.udp.state).toBe('connected');

    // Terminate the session
    const closeResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION
      }
    });
    expect(closeResponse.status).toBe(200);
  });
});

describe('HttpGateway security options', () => {
  let stdioServer: McpServer;
  let registry: ToolRegistry;
  let gateway: HttpGateway;
  let baseUrl: string;

  const securityOptions = {
    apiKeys: ['test-key'],
    mcpTokens: ['token-123'],
    ipAllowlist: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
    allowedOrigins: ['http://localhost'],
    rateLimit: { windowMs: 10_000, max: 2 }
  } as const;

  beforeEach(async () => {
    stdioServer = new McpServer({
      name: 'secure-stdio',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(stdioServer);
    registry.register(tool);

    gateway = createHttpGateway(registry, {
      port: 0,
      security: { ...securityOptions },
      serverFactory: () => createSessionServer()
    });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await gateway.stop();
    await stdioServer.close();
  });

  test('allows initialization with valid credentials', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'auth-init',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'jest-client',
            version: '0.0.1'
          }
        }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeTruthy();
  });

  test('rejects initialization without authentication headers', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'http://localhost'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'unauthorized',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'jest-client',
            version: '0.0.1'
          }
        }
      })
    });

    expect(response.status).toBe(401);
  });

  test('uses X-Forwarded-For when trust proxy is enabled', async () => {
    const forwardedIp = '203.0.113.42';
    const strictSecurity = {
      ...securityOptions,
      ipAllowlist: [forwardedIp],
      rateLimit: { windowMs: 60_000, max: 1 }
    } as const;

    const forwardedGateway = createHttpGateway(registry, {
      port: 0,
      trustProxy: true,
      security: { ...strictSecurity },
      serverFactory: () => createSessionServer()
    });

    await forwardedGateway.start();

    try {
      const forwardedAddress = forwardedGateway.getAddress();
      if (!forwardedAddress) {
        throw new Error('Adresse de la passerelle introuvable');
      }

      const forwardedBaseUrl = `http://127.0.0.1:${forwardedAddress.port}`;
      const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: 'trust-proxy-init',
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'jest-client', version: '0.0.1' }
        }
      });

      const commonHeaders = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'http://localhost',
        'x-api-key': strictSecurity.apiKeys[0],
        'x-mcp-token': strictSecurity.mcpTokens[0]
      } as const;

      const forbiddenResponse = await fetch(`${forwardedBaseUrl}/mcp`, {
        method: 'POST',
        headers: commonHeaders,
        body: requestBody
      });
      expect(forbiddenResponse.status).toBe(403);

      const allowedResponse = await fetch(`${forwardedBaseUrl}/mcp`, {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'x-forwarded-for': `${forwardedIp}, 10.0.0.5`
        },
        body: requestBody
      });
      expect(allowedResponse.status).toBe(200);

      const rateLimitedResponse = await fetch(`${forwardedBaseUrl}/mcp`, {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'x-forwarded-for': forwardedIp
        },
        body: requestBody
      });
      expect(rateLimitedResponse.status).toBe(429);

      const internalGateway = forwardedGateway as unknown as {
        rateLimitState: Map<string, { windowStart: number; count: number }>;
      };
      expect(internalGateway.rateLimitState.has(forwardedIp)).toBe(true);
    } finally {
      await forwardedGateway.stop();
    }
  });

  test('cleans up expired rate limit entries before reuse', () => {
    const internalGateway = gateway as unknown as {
      consumeRateLimit: (ip: string) => boolean;
      rateLimitState: Map<string, { windowStart: number; count: number }>;
    };

    const nowSpy = jest.spyOn(Date, 'now');

    const initialTime = 1_000;
    nowSpy.mockReturnValue(initialTime);
    expect(internalGateway.consumeRateLimit('192.0.2.1')).toBe(true);
    expect(internalGateway.rateLimitState.has('192.0.2.1')).toBe(true);

    const advancedTime =
      initialTime + securityOptions.rateLimit.windowMs * 100;
    nowSpy.mockReturnValue(advancedTime);
    expect(internalGateway.consumeRateLimit('198.51.100.1')).toBe(true);

    expect(internalGateway.rateLimitState.has('192.0.2.1')).toBe(false);
    expect(internalGateway.rateLimitState.has('198.51.100.1')).toBe(true);

    nowSpy.mockRestore();
  });
});
