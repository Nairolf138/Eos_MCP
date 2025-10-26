import { jest } from '@jest/globals';
import { ErrorCode } from '../errors';

const mockConnect = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockRegisterTool = jest.fn();
const mockSendToolListChanged = jest.fn();
const mockAssertTcpPortAvailable = jest.fn();
const mockAssertUdpPortAvailable = jest.fn();

const MockMcpServer = jest.fn().mockImplementation(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  close: mockClose,
  registerTool: mockRegisterTool,
  sendToolListChanged: mockSendToolListChanged
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
      tcpPort: 3033
    },
    osc: {
      remoteAddress: '192.168.1.176',
      tcpPort: 3032,
      udpOutPort: 8001,
      udpInPort: 8000,
      localAddress: '0.0.0.0'
    },
    logging: {
      level: 'info',
      format: 'json',
      destinations: [{ type: 'stdout' }]
    },
    httpGateway: {
      security: {
        apiKeys: [],
        mcpTokens: ['token-123456789-token-123456789'],
        ipAllowlist: ['*'],
        allowedOrigins: ['*'],
        rateLimit: { windowMs: 60000, max: 60 }
      }
    }
  })),
  resetConfigCacheForTesting: jest.fn()
}));

const mockOscGateway = {
  close: jest.fn(),
  setLoggingOptions: jest.fn(),
  getDiagnostics: jest.fn(() => ({
    stats: {},
    uptimeMs: 0,
    startedAt: Date.now()
  }))
};

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

const mockGatewayInstance = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  getAddress: jest.fn()
};

jest.mock('../httpGateway.js', () => ({
  createHttpGateway: jest.fn(() => mockGatewayInstance)
}));

jest.mock('../startupChecks.js', () => ({
  assertTcpPortAvailable: mockAssertTcpPortAvailable,
  assertUdpPortAvailable: mockAssertUdpPortAvailable
}));

jest.mock('../../schemas/index.js', () => ({
  registerToolSchemas: jest.fn()
}));

jest.mock('../../tools/index.js', () => ({
  toolDefinitions: []
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

describe('bootstrap OSC handshake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockReset();
    mockAssertTcpPortAvailable.mockReset().mockResolvedValue(undefined);
    mockAssertUdpPortAvailable.mockReset().mockResolvedValue(undefined);
    mockGatewayInstance.start.mockClear();
    mockGatewayInstance.stop.mockClear();
    mockGatewayInstance.getAddress.mockClear();
    delete process.env.MCP_SKIP_OSC_HANDSHAKE;
  });

  test('realise un handshake et journalise la version et le protocole', async () => {
    mockConnect.mockResolvedValue({
      status: 'ok',
      version: '3.2.0',
      availableProtocols: ['tcp', 'udp'],
      selectedProtocol: 'udp',
      protocolStatus: 'ok',
      handshakePayload: {},
      protocolResponse: {}
    });

    const { bootstrap } = await import('../index.js');
    const context = await bootstrap();

    expect(mockAssertTcpPortAvailable).toHaveBeenCalledTimes(1);
    expect(mockAssertTcpPortAvailable).toHaveBeenCalledWith(3100);
    expect(mockAssertUdpPortAvailable).toHaveBeenCalledTimes(1);
    expect(mockAssertUdpPortAvailable).toHaveBeenCalledWith(8000);
    expect(mockAssertUdpPortAvailable).not.toHaveBeenCalledWith(8001);
    expect(mockAssertTcpPortAvailable).not.toHaveBeenCalledWith(3032);

    expect(mockConnect).toHaveBeenCalledWith({
      toolId: 'startup_preflight',
      handshakeTimeoutMs: 10000,
      protocolTimeoutMs: 10000
    });

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        osc: expect.objectContaining({
          version: '3.2.0',
          selectedProtocol: 'udp'
        })
      }),
      'Connexion OSC initiale etablie.'
    );

    await context.server.close();
    await context.gateway?.stop?.();
    context.oscGateway.close?.();
  });

  test('echoue lorsque le handshake retourne timeout', async () => {
    mockConnect.mockResolvedValue({
      status: 'timeout',
      version: null,
      availableProtocols: [],
      selectedProtocol: null,
      protocolStatus: 'skipped',
      handshakePayload: null,
      protocolResponse: null,
      error: 'delai'
    });

    const { bootstrap } = await import('../index.js');

    await expect(bootstrap()).rejects.toMatchObject({ code: ErrorCode.MCP_STARTUP_FAILURE });

    expect(mockLogger.fatal).toHaveBeenCalled();
  });

  test('peut contourner le handshake via une option', async () => {
    mockConnect.mockImplementation(() => Promise.reject(new Error('ne doit pas etre appele')));

    const { bootstrap } = await import('../index.js');
    const context = await bootstrap({ skipOscHandshake: true });

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { reason: 'option-cli' },
      'Verification initiale de la connexion OSC ignoree (utilisation reservee au developpement/tests).'
    );

    await context.server.close();
    await context.gateway?.stop?.();
    context.oscGateway.close?.();
  });
});
