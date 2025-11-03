import dgram, { type SocketType } from 'node:dgram';
import { jest } from '@jest/globals';

describe('bootstrap with OSC local address overrides', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  async function runBootstrapWithEnv(envOverrides: NodeJS.ProcessEnv = {}): Promise<void> {
    const baseEnv = process.env;
    process.env = {
      ...baseEnv,
      MCP_SKIP_OSC_HANDSHAKE: '1',
      ...envOverrides
    };

    const mockConnect = jest.fn().mockResolvedValue({ status: 'ok' });
    const mockClose = jest.fn().mockResolvedValue(undefined);
    const mockRegisterTool = jest.fn();
    const mockSendToolListChanged = jest.fn();
    const mockRegisterResource = jest.fn().mockReturnValue({ dispose: jest.fn() });
    const mockSendResourceListChanged = jest.fn();

    const mockOscGateway = {
      close: jest.fn(),
      setLoggingOptions: jest.fn(),
      getDiagnostics: jest.fn(() => ({
        config: {
          localAddress: process.env.OSC_LOCAL_ADDRESS ?? '0.0.0.0',
          localPort: Number(process.env.OSC_UDP_IN_PORT ?? 0),
          remoteAddress: process.env.OSC_REMOTE_ADDRESS ?? '127.0.0.1',
          remotePort: Number(process.env.OSC_UDP_OUT_PORT ?? 0)
        },
        logging: { incoming: false, outgoing: false },
        stats: {
          incoming: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] },
          outgoing: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: [] }
        },
        listeners: { active: 0 },
        startedAt: Date.now(),
        uptimeMs: 0
      }))
    };

    const mockHttpGateway = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      getAddress: jest.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 0 }))
    };

    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
          McpServer: jest.fn().mockImplementation(() => ({
            connect: mockConnect,
            close: mockClose,
          registerTool: mockRegisterTool,
          sendToolListChanged: mockSendToolListChanged,
          registerResource: mockRegisterResource,
          sendResourceListChanged: mockSendResourceListChanged
        }))
      }));

      jest.doMock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
        StdioServerTransport: jest.fn().mockImplementation(() => ({}))
      }));

      jest.doMock('../../config/index.js', () => {
        const actual = jest.requireActual('../../config/index.js');
        return {
          ...actual,
          resetConfigCacheForTesting: jest.fn(() => {
            if (typeof actual.resetConfigCacheForTesting === 'function') {
              actual.resetConfigCacheForTesting();
            }
          })
        };
      });

      jest.doMock('../../services/osc/index.js', () => ({
        createOscGatewayFromEnv: jest.fn(() => mockOscGateway),
        OscConnectionStateProvider: jest
          .fn()
          .mockImplementation(() => ({
            setStatus: jest.fn(),
            getOverview: jest.fn(() => ({
              health: 'offline',
              transports: {
                tcp: {
                  type: 'tcp',
                  state: 'disconnected',
                  lastHeartbeatAckAt: null,
                  lastHeartbeatSentAt: null,
                  consecutiveFailures: 0
                },
                udp: {
                  type: 'udp',
                  state: 'disconnected',
                  lastHeartbeatAckAt: null,
                  lastHeartbeatSentAt: null,
                  consecutiveFailures: 0
                }
              },
              updatedAt: Date.now()
            }))
          }))
      }));

      jest.doMock('../../services/osc/client.js', () => ({
        initializeOscClient: jest.fn(),
        getOscClient: jest.fn(() => ({ connect: jest.fn() })),
        getOscGateway: jest.fn(() => mockOscGateway),
        onOscGatewayChange: jest.fn((listener: (gateway: typeof mockOscGateway) => void) => {
          listener(mockOscGateway);
          return jest.fn();
        })
      }));

      jest.doMock('../httpGateway.js', () => ({
        createHttpGateway: jest.fn(() => mockHttpGateway)
      }));

      jest.doMock('../logger.js', () => ({
        createLogger: jest.fn(() => ({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          fatal: jest.fn(),
          debug: jest.fn()
        })),
        initialiseLogger: jest.fn()
      }));

      jest.doMock('../../schemas/index.js', () => ({
        registerToolSchemas: jest.fn()
      }));

      jest.doMock('../../resources/registerManual.js', () => ({
        registerManualResource: jest.fn().mockResolvedValue(undefined)
      }));

      jest.doMock('../../tools/index.js', () => ({
        toolDefinitions: []
      }));

        const module = await import('../index.js');
        const context = await module.bootstrap({ skipOscHandshake: true });

        await context.server.close();
        await context.gateway?.stop?.();
        context.oscGateway.close?.();
      });
    } finally {
      process.env = baseEnv;
    }
  }

  async function createBlockingSocket(
    address: string,
    type: SocketType
  ): Promise<{ socket: dgram.Socket; port: number }> {
    const socket = dgram.createSocket(type);
    const port = await new Promise<number>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind({ address, port: 0 }, () => {
        const info = socket.address();
        resolve(info.port);
      });
    });
    return { socket, port };
  }

  test('succeeds when OSC_LOCAL_ADDRESS targets loopback while another interface uses the port', async () => {
    const { socket, port } = await createBlockingSocket('127.0.0.2', 'udp4');

    try {
      await expect(
        runBootstrapWithEnv({ OSC_LOCAL_ADDRESS: '127.0.0.1', OSC_UDP_IN_PORT: String(port) })
      ).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => {
        socket.close(() => resolve());
      });
    }
  });

  test('succeeds when OSC_LOCAL_ADDRESS targets IPv6 despite IPv4 usage of the port', async () => {
    const { socket, port } = await createBlockingSocket('0.0.0.0', 'udp4');

    try {
      await expect(
        runBootstrapWithEnv({ OSC_LOCAL_ADDRESS: '::1', OSC_UDP_IN_PORT: String(port) })
      ).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => {
        socket.close(() => resolve());
      });
    }
  });
});
