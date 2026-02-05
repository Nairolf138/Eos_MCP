import { jest } from '@jest/globals';
import { getPackageVersion } from '../../utils/version';

const mockConnect = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockRegisterTool = jest.fn();
const mockSendToolListChanged = jest.fn();
const mockRegisterResource = jest.fn().mockReturnValue({ dispose: jest.fn() });
const mockSendResourceListChanged = jest.fn();
const mockAssertTcpPortAvailable = jest.fn();
const mockAssertUdpPortAvailable = jest.fn();

const MockMcpServer = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  close: mockClose,
  registerTool: mockRegisterTool,
  sendToolListChanged: mockSendToolListChanged,
  registerResource: mockRegisterResource,
  sendResourceListChanged: mockSendResourceListChanged
}));

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: MockMcpServer
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../config/index.js', () => ({
  getConfig: jest.fn(() => ({
    mcp: {
      tcpPort: 3100
    },
    osc: {
      remoteAddress: '127.0.0.1',
      tcpPort: 3032,
      udpOutPort: 8001,
      udpInPort: 8000,
      localAddress: '0.0.0.0',
      tcpNoDelay: true,
      tcpKeepAliveMs: 5000,
      udpRecvBufferSize: 262144,
      udpSendBufferSize: 524288
    },
    logging: {
      level: 'info',
      format: 'json',
      destinations: [{ type: 'stderr' }]
    },
    httpGateway: {
      trustProxy: false,
      security: {
        apiKeys: [],
        mcpTokens: ['change-me'],
        ipAllowlist: [],
        allowedOrigins: [],
        rateLimit: { windowMs: 60000, max: 60 }
      }
    }
  })),
  resetConfigCacheForTesting: jest.fn()
}));

const mockOscGateway = { close: jest.fn() };
const mockOscConnectionStateProvider = jest
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
  }));

jest.mock('../../services/osc/index.js', () => ({
  createOscGatewayFromEnv: jest.fn(() => mockOscGateway),
  OscConnectionStateProvider: mockOscConnectionStateProvider
}));

jest.mock('../../services/osc/client.js', () => ({
  initializeOscClient: jest.fn(),
  getOscClient: jest.fn(() => ({
    connect: mockConnect
  })),
  getOscGateway: jest.fn(() => mockOscGateway),
  onOscGatewayChange: jest.fn((listener: (gateway: typeof mockOscGateway) => void) => {
    listener(mockOscGateway);
    return jest.fn();
  })
}));

jest.mock('../startupChecks.js', () => ({
  assertTcpPortAvailable: mockAssertTcpPortAvailable,
  assertUdpPortAvailable: mockAssertUdpPortAvailable
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
};

jest.mock('../logger.js', () => ({
  createLogger: jest.fn(() => mockLogger),
  initialiseLogger: jest.fn()
}));

jest.mock('../../schemas/index.js', () => ({
  registerToolSchemas: jest.fn()
}));

jest.mock('../../tools/index.js', () => ({
  toolDefinitions: []
}));

jest.mock('../httpGateway.js', () => ({
  createHttpGateway: jest.fn().mockReturnValue({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getAddress: jest.fn()
  })
}));

describe('bootstrap version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({
      status: 'ok',
      version: '3.1.0',
      availableProtocols: ['tcp'],
      selectedProtocol: 'tcp',
      protocolStatus: 'ok',
      handshakePayload: {},
      protocolResponse: {}
    });
    mockAssertTcpPortAvailable.mockReset().mockResolvedValue(undefined);
    mockAssertUdpPortAvailable.mockReset().mockResolvedValue(undefined);
  });

  test('initialise le serveur avec la version du package', async () => {
    const expectedVersion = getPackageVersion();

    const { bootstrap } = await import('../index.js');
    const context = await bootstrap();

    expect(MockMcpServer).toHaveBeenCalledWith({
      name: 'eos-mcp-server',
      version: expectedVersion
    });

    await context.server.close();
    await context.gateway?.stop?.();
    context.oscGateway.close?.();
  });
});
