import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import WebSocket from 'ws';
import { createHttpGateway, type HttpGateway } from '../httpGateway';
import { ToolRegistry } from '../toolRegistry';
import type { ToolDefinition } from '../../tools/types';
import {
  OscConnectionStateProvider,
  type TransportStatus
} from '../../services/osc/index';

const tool: ToolDefinition = {
  name: 'echo_test',
  config: {
    description: 'Echo test tool'
  },
  handler: async (args) => {
    return {
      content: [
        {
          type: 'text',
          text: `echo:${JSON.stringify(args ?? {})}`
        }
      ]
    };
  }
};

describe('HttpGateway integration', () => {
  let server: McpServer;
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
    server = new McpServer({
      name: 'test-server',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(server);
    registry.register(tool);
    connectionState = new OscConnectionStateProvider();
    updateTransportStatus('tcp', 'connected');
    updateTransportStatus('udp', 'connected');
    gateway = createHttpGateway(registry, { port: 0, oscConnectionProvider: connectionState });
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
    await server.close();
  });

  test('execute tool via HTTP POST', async () => {
    const response = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        args: {
          text: 'http'
        }
      })
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { tool: string; result: unknown };
    expect(payload.tool).toBe(tool.name);
    expect(payload.result).toEqual({
      content: [
        {
          type: 'text',
          text: 'echo:{"text":"http"}'
        }
      ]
    });
  });

  test('reports health status via HTTP GET', async () => {
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
      | { http: { status: string; websocketClients: number; startedAt: number | null } }
      | undefined;
    expect(mcp).toBeDefined();
    if (!mcp) {
      throw new Error('MCP status missing');
    }
    expect(mcp.http.status).toBe('listening');
    expect(typeof mcp.http.websocketClients).toBe('number');
    const osc = payload.osc as
      | {
          status: string;
          transports: { tcp: { state: string }; udp: { state: string } };
          updatedAt: number;
          diagnostics?: unknown;
        }
      | undefined;
    expect(osc).toBeDefined();
    if (!osc) {
      throw new Error('OSC status missing');
    }
    expect(osc.status).toBe('online');
    expect(osc.transports.tcp.state).toBe('connected');
    expect(osc.transports.udp.state).toBe('connected');
    expect(typeof osc.updatedAt).toBe('number');
    expect(osc.diagnostics).toBeUndefined();
  });

  test('reports degraded status when a single transport is connected', async () => {
    updateTransportStatus('tcp', 'connected');
    updateTransportStatus('udp', 'disconnected');

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'content-type': 'application/json'
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.status).toBe('degraded');
    const osc = payload.osc as
      | {
          status: string;
          transports: { tcp: { state: string }; udp: { state: string } };
          updatedAt: number;
        }
      | undefined;
    expect(osc).toBeDefined();
    if (!osc) {
      throw new Error('OSC status missing');
    }
    expect(osc.status).toBe('degraded');
    expect(osc.transports.tcp.state).toBe('connected');
    expect(osc.transports.udp.state).toBe('disconnected');
  });

  test('reports offline status when no transports are connected', async () => {
    updateTransportStatus('tcp', 'disconnected');
    updateTransportStatus('udp', 'disconnected');

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'content-type': 'application/json'
      }
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.status).toBe('offline');
    const osc = payload.osc as
      | {
          status: string;
          transports: { tcp: { state: string }; udp: { state: string } };
          updatedAt: number;
        }
      | undefined;
    expect(osc).toBeDefined();
    if (!osc) {
      throw new Error('OSC status missing');
    }
    expect(osc.status).toBe('offline');
    expect(osc.transports.tcp.state).toBe('disconnected');
    expect(osc.transports.udp.state).toBe('disconnected');
  });

  test('exposes manifest with tool schema references', async () => {
    const response = await fetch(`${baseUrl}/manifest.json`, {
      headers: {
        'content-type': 'application/json'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const manifest = (await response.json()) as Record<string, unknown>;
    const typedManifest = manifest as {
      name?: string;
      description?: unknown;
      version?: string;
      mcp?: {
        capabilities?: {
          tools?: {
            schema_catalogs?: string[];
            schema_base_path?: string;
          };
        };
      };
    };

    expect(typedManifest.name).toBe('Eos MCP');
    expect(typeof typedManifest.description).toBe('string');
    expect(typedManifest.version).toBe('1.0.0');
    const mcp = typedManifest.mcp as
      | {
          capabilities?: {
            tools?: {
              schema_catalogs?: string[];
              schema_base_path?: string;
            };
          };
        }
      | undefined;
    expect(mcp).toBeDefined();
    if (!mcp) {
      throw new Error('Manifest MCP block missing');
    }

    const catalogRefs = mcp.capabilities?.tools?.schema_catalogs ?? [];
    expect(catalogRefs).toContain('/schemas/tools/index.json');
    const basePath = mcp.capabilities?.tools?.schema_base_path;
    expect(basePath).toBe('/schemas/tools/{toolName}.json');
  });

  test('execute tool via WebSocket', async () => {
    const address = new URL(baseUrl);
    const ws = new WebSocket(`ws://${address.host}/ws`);

    const response = await new Promise<{ type: string; id?: string; tool?: string; result?: unknown }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout en attente de la reponse WebSocket'));
      }, 5000);

      ws.on('message', (raw) => {
        const message = typeof raw === 'string' ? raw : raw.toString('utf-8');
        const data = JSON.parse(message) as Record<string, unknown>;

        if (data.type === 'ready') {
          ws.send(
            JSON.stringify({
              id: 'ws-call',
              tool: tool.name,
              args: { text: 'ws' }
            })
          );
          return;
        }

        clearTimeout(timeout);
        resolve(data as { type: string; id?: string; tool?: string; result?: unknown });
        ws.close();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(response.type).toBe('result');
    expect(response.tool).toBe(tool.name);
    expect(response.result).toEqual({
      content: [
        {
          type: 'text',
          text: 'echo:{"text":"ws"}'
        }
      ]
    });
  });
});

describe('HttpGateway security options', () => {
  let server: McpServer;
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
    server = new McpServer({
      name: 'secure-test-server',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(server);
    registry.register(tool);
    gateway = createHttpGateway(registry, { port: 0, security: { ...securityOptions } });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await gateway.stop();
    await server.close();
  });

  test('allows HTTP request with valid credentials', async () => {
    const response = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({
        args: {
          text: 'secured-http'
        }
      })
    });

    expect(response.status).toBe(200);
  });

  test('rejects health endpoint without credentials', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        origin: 'http://localhost'
      }
    });

    expect(response.status).toBe(401);
  });

  test('rejects HTTP request without API key', async () => {
    const response = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({ args: { text: 'no-key' } })
    });

    expect(response.status).toBe(401);
  });

  test('rejects HTTP request from disallowed origin', async () => {
    const response = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://example.com'
      },
      body: JSON.stringify({ args: { text: 'bad-origin' } })
    });

    expect(response.status).toBe(403);
  });

  test('denies HTTP request when IP allowlist is empty', async () => {
    await gateway.stop();
    gateway = createHttpGateway(registry, {
      port: 0,
      security: { ...securityOptions, ipAllowlist: [] }
    });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    const lockedUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${lockedUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({ args: { text: 'denied' } })
    });

    expect(response.status).toBe(403);
  });

  test('denies HTTP request with origin when allowed origins list is empty', async () => {
    await gateway.stop();
    gateway = createHttpGateway(registry, {
      port: 0,
      security: { ...securityOptions, allowedOrigins: [] }
    });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    const lockedUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${lockedUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({ args: { text: 'cors-denied' } })
    });

    expect(response.status).toBe(403);

    const responseWithoutOrigin = await fetch(`${lockedUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0]
      },
      body: JSON.stringify({ args: { text: 'no-origin' } })
    });

    expect(responseWithoutOrigin.status).toBe(200);
  });

  test('enforces HTTP rate limiting', async () => {
    const headers = {
      'content-type': 'application/json',
      'x-api-key': securityOptions.apiKeys[0],
      'x-mcp-token': securityOptions.mcpTokens[0],
      origin: 'http://localhost'
    } as Record<string, string>;

    const first = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args: { text: 'first' } })
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args: { text: 'second' } })
    });
    expect(second.status).toBe(200);

    const third = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args: { text: 'third' } })
    });
    expect(third.status).toBe(429);
  });

  test('closes WebSocket connection when authentication fails', async () => {
    const address = new URL(baseUrl);
    const ws = new WebSocket(`ws://${address.host}/ws`, {
      headers: {
        origin: 'http://localhost'
      }
    });

    const closeEvent = await new Promise<{ code: number }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
      ws.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ code });
      });
      ws.on('message', () => {
        // Les connexions rejetées peuvent envoyer un message d'erreur avant la fermeture.
      });
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(closeEvent.code).toBe(1008);
  });

  test('accepts WebSocket connection with valid credentials', async () => {
    const address = new URL(baseUrl);
    const ws = new WebSocket(`ws://${address.host}/ws`, {
      headers: {
        origin: 'http://localhost',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0]
      }
    });

    const readyMessage = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout WebSocket')), 5000);
      ws.on('message', (raw) => {
        clearTimeout(timeout);
        const message = typeof raw === 'string' ? raw : raw.toString('utf-8');
        resolve(JSON.parse(message) as Record<string, unknown>);
        ws.close();
      });
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(readyMessage.type).toBe('ready');
  });

  test('allows custom authentication middleware override', async () => {
    const authCalls: number[] = [];
    await gateway.stop();
    await server.close();

    server = new McpServer({
      name: 'secure-test-server',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(server);
    registry.register(tool);
    gateway = createHttpGateway(registry, {
      port: 0,
      security: {
        ...securityOptions,
        express: {
          authentication: (_req, _res, next) => {
            authCalls.push(Date.now());
            next();
          }
        }
      }
    });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/tools/${tool.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': securityOptions.apiKeys[0],
        'x-mcp-token': securityOptions.mcpTokens[0],
        origin: 'http://localhost'
      },
      body: JSON.stringify({ args: { text: 'custom-auth' } })
    });

    expect(response.status).toBe(200);
    expect(authCalls.length).toBeGreaterThan(0);
  });
});
