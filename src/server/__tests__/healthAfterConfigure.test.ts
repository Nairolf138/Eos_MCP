import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { createHttpGateway, type HttpGateway } from '../httpGateway';
import { ToolRegistry } from '../toolRegistry';
import type { ToolDefinition } from '../../tools/types';
import {
  OscConnectionStateProvider,
  type OscDiagnostics,
  type OscMessage
} from '../../services/osc/index';
import {
  initializeOscClient,
  getOscGateway,
  setOscClient
} from '../../services/osc/client';
import * as oscModule from '../../services/osc/index';
import { eosConfigureTool } from '../../tools/connection/eos_configure';

class TestGateway {
  private readonly listeners = new Set<(message: OscMessage) => void>();

  constructor(
    private readonly provider: OscConnectionStateProvider,
    private diagnostics: OscDiagnostics
  ) {}

  public async send(_message: OscMessage, _options?: unknown): Promise<void> {
    return Promise.resolve();
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(message: OscMessage): void {
    this.listeners.forEach((listener) => listener(message));
  }

  public setDiagnostics(diagnostics: OscDiagnostics): void {
    this.diagnostics = diagnostics;
  }

  public getDiagnostics(): OscDiagnostics {
    return this.diagnostics;
  }

  public getConnectionStateProvider(): OscConnectionStateProvider {
    return this.provider;
  }

  public close(): void {
    this.listeners.clear();
  }
}

function createDiagnostics(
  overrides: Partial<OscDiagnostics> & {
    config: OscDiagnostics['config'];
  }
): OscDiagnostics {
  return {
    config: overrides.config,
    logging: overrides.logging ?? { incoming: false, outgoing: false },
    stats:
      overrides.stats ??
      {
        incoming: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] },
        outgoing: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] }
      },
    listeners: overrides.listeners ?? { active: 0 },
    startedAt: overrides.startedAt ?? Date.now(),
    uptimeMs: overrides.uptimeMs ?? 0
  };
}

const tool: ToolDefinition = {
  name: 'noop',
  config: {
    description: 'noop'
  },
  handler: async () => ({
    content: [
      {
        type: 'text',
        text: 'noop'
      }
    ]
  })
};

const createSessionServer = (): McpServer => {
  const instance = new McpServer({ name: 'health-session', version: '0.0.0-test' });
  const sessionRegistry = new ToolRegistry(instance);
  sessionRegistry.register(tool);
  return instance;
};

describe('HTTP /health after eos_configure', () => {
  let server: McpServer;
  let registry: ToolRegistry;
  let gateway: HttpGateway;
  let baseUrl: string;
  let connectionState: OscConnectionStateProvider;
  let initialGateway: TestGateway;

  const markConnected = (type: 'tcp' | 'udp'): void => {
    const timestamp = Date.now();
    connectionState.setStatus({
      type,
      state: 'connected',
      lastHeartbeatAckAt: timestamp,
      lastHeartbeatSentAt: timestamp,
      consecutiveFailures: 0
    });
  };

  beforeAll(async () => {
    setOscClient(null);

    server = new McpServer({ name: 'health-test', version: '0.0.0-test' });
    registry = new ToolRegistry(server);
    registry.register(tool);

    connectionState = new OscConnectionStateProvider();
    markConnected('tcp');
    markConnected('udp');

    initialGateway = new TestGateway(
      connectionState,
      createDiagnostics({
        config: {
          localAddress: '0.0.0.0',
          localPort: 7001,
          remoteAddress: '192.168.0.10',
          remotePort: 9002
        }
      })
    );

    initializeOscClient(initialGateway);

    gateway = createHttpGateway(registry, {
      port: 0,
      oscConnectionProvider: connectionState,
      serverFactory: () => createSessionServer(),
      oscGateway: {
        getDiagnostics: () => {
          const diagnostics = getOscGateway().getDiagnostics?.();
          if (!diagnostics) {
            throw new Error('Diagnostics indisponibles');
          }
          return diagnostics;
        }
      }
    });

    await gateway.start();
    const address = gateway.getAddress();
    if (!address) {
      throw new Error('Adresse HTTP indisponible');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await gateway.stop();
    await server.close();
    setOscClient(null);
  });

  test('exposes diagnostics after reconfiguration', async () => {
    const initialResponse = await fetch(`${baseUrl}/health`);
    expect(initialResponse.status).toBe(200);
    const initialPayload = (await initialResponse.json()) as {
      osc?: { diagnostics?: OscDiagnostics };
    };

    const initialDiagnostics = initialPayload.osc?.diagnostics;
    expect(initialDiagnostics?.config.remoteAddress).toBe('192.168.0.10');
    expect(initialDiagnostics?.config.remotePort).toBe(9002);

    const newGateway = new TestGateway(
      connectionState,
      createDiagnostics({
        config: {
          localAddress: '0.0.0.0',
          localPort: 7001,
          remoteAddress: '203.0.113.5',
          remotePort: 10001
        }
      })
    );

    const gatewaySpy = jest
      .spyOn(oscModule, 'createOscConnectionGateway')
      .mockReturnValue(newGateway as unknown as oscModule.OscConnectionGateway);

    await eosConfigureTool.handler({
      remoteAddress: '203.0.113.5',
      remotePort: 10001,
      localPort: 7001,
      tcpPort: 3032
    });

    expect(gatewaySpy).toHaveBeenCalledTimes(1);
    const createArgs = gatewaySpy.mock.calls[0]?.[0];
    expect(createArgs?.connectionStateProvider).toBe(connectionState);
    gatewaySpy.mockRestore();

    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      osc?: {
        status?: string;
        diagnostics?: OscDiagnostics;
      };
    };

    expect(payload.status).toBe('ok');
    const osc = payload.osc;
    expect(osc).toBeDefined();
    const diagnostics = osc?.diagnostics;
    expect(diagnostics).toBeDefined();
    if (!diagnostics) {
      throw new Error('Diagnostics absents du payload');
    }

    expect(diagnostics.config.remoteAddress).toBe('203.0.113.5');
    expect(diagnostics.config.remotePort).toBe(10001);
  });
});

