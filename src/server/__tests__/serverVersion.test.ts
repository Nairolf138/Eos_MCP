import { jest } from '@jest/globals';
import { getPackageVersion } from '../../utils/version';

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockRegisterTool = jest.fn();
const mockSendToolListChanged = jest.fn();

const MockMcpServer = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
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
  config: {
    mcp: {},
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
    }
  }
}));

const mockOscGateway = { close: jest.fn() };

jest.mock('../../services/osc/index.js', () => ({
  createOscGatewayFromEnv: jest.fn(() => mockOscGateway)
}));

jest.mock('../../services/osc/client.js', () => ({
  initializeOscClient: jest.fn()
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
    context.oscGateway.close?.();
  });
});
