import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import WebSocket from 'ws';
import { createHttpGateway, type HttpGateway } from '../httpGateway.js';
import { ToolRegistry } from '../toolRegistry.js';
import type { ToolDefinition } from '../../tools/types.js';

describe('HttpGateway integration', () => {
  let server: McpServer;
  let registry: ToolRegistry;
  let gateway: HttpGateway;
  let baseUrl: string;

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

  beforeAll(async () => {
    server = new McpServer({
      name: 'test-server',
      version: '0.0.0-test'
    });
    registry = new ToolRegistry(server);
    registry.register(tool);
    gateway = createHttpGateway(registry, { port: 0 });
    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse de la passerelle introuvable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
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
