import { eosConfigureTool } from '../eos_configure';

const mockClose = jest.fn();
const mockGetDiagnostics = jest.fn();

const mockCreateGateway = jest.fn();

jest.mock('../../../services/osc/client.js', () => ({
  getOscGateway: jest.fn(() => ({
    close: mockClose
  })),
  resetOscClient: jest.fn(() => ({
    getDiagnostics: mockGetDiagnostics
  })),
  getOscConnectionStateProvider: jest.fn(() => undefined)
}));

jest.mock('../../../services/osc/index.js', () => ({
  createOscConnectionGateway: jest.fn((options) => mockCreateGateway(options))
}));

describe('eos_configure tool', () => {
  const clientModule = jest.requireMock('../../../services/osc/client.js') as {
    getOscGateway: jest.Mock;
    resetOscClient: jest.Mock;
    getOscConnectionStateProvider: jest.Mock;
  };
  const oscModule = jest.requireMock('../../../services/osc/index.js') as {
    createOscConnectionGateway: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClose.mockReset();
    mockGetDiagnostics.mockReset();
    mockCreateGateway.mockImplementation((options) => ({
      options,
      getDiagnostics: mockGetDiagnostics
    }));
    clientModule.getOscGateway.mockReturnValue({ close: mockClose });
    clientModule.resetOscClient.mockReturnValue({
      getDiagnostics: mockGetDiagnostics
    });
    clientModule.getOscConnectionStateProvider.mockReturnValue(null);
    oscModule.createOscConnectionGateway.mockImplementation(mockCreateGateway);
  });

  it('valide les arguments, reconfigure le service et renvoie un resume', async () => {
    const diagnostics = {
      config: {
        localAddress: '0.0.0.0',
        localPort: 7001,
        remoteAddress: '10.1.0.5',
        remotePort: 9002
      },
      logging: { incoming: true, outgoing: false },
      stats: {
        incoming: { count: 1, bytes: 20, lastTimestamp: 1, lastMessage: null, addresses: [] },
        outgoing: { count: 2, bytes: 40, lastTimestamp: 2, lastMessage: null, addresses: [] }
      },
      listeners: { active: 3 },
      startedAt: 0,
      uptimeMs: 1234
    };
    mockGetDiagnostics.mockReturnValue(diagnostics);

    const result = await eosConfigureTool.handler({
      remoteAddress: '10.1.0.5',
      remotePort: 9002,
      localPort: 7001
    });

    expect(clientModule.getOscGateway).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(oscModule.createOscConnectionGateway).toHaveBeenCalledTimes(1);
    expect(oscModule.createOscConnectionGateway).toHaveBeenCalledWith({
      host: '10.1.0.5',
      udpPort: 9002,
      tcpPort: 3032,
      localPort: 7001,
      logger: expect.any(Object),
      connectionStateProvider: undefined
    });
    const createdGateway = mockCreateGateway.mock.results[0]?.value;
    expect(clientModule.resetOscClient).toHaveBeenCalledWith(createdGateway);
    expect(clientModule.resetOscClient).toHaveBeenCalledTimes(1);
    expect(mockGetDiagnostics).toHaveBeenCalledTimes(1);

    expect(result.content).toHaveLength(1);
    const [textContent] = result.content;
    if (textContent.type !== 'text') {
      throw new Error('Le premier contenu doit etre du texte');
    }
    expect(textContent.text).toContain('10.1.0.5:9002');
    expect(textContent.text).toContain('Local : 0.0.0.0:7001');

    expect(result.structuredContent).toEqual({ diagnostics });
  });

  it('rejette les configurations invalides', async () => {
    await expect(
      eosConfigureTool.handler({ remoteAddress: '', remotePort: 0, localPort: 0 })
    ).rejects.toThrow();
  });
});
