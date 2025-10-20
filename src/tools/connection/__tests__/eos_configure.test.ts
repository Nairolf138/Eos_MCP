import { eosConfigureTool } from '../eos_configure';

const mockReconfigure = jest.fn();
const mockGetDiagnostics = jest.fn();

jest.mock('../../../services/osc/client.js', () => ({
  getOscService: jest.fn(() => ({
    reconfigure: mockReconfigure
  })),
  resetOscClient: jest.fn(() => ({
    getDiagnostics: mockGetDiagnostics
  }))
}));

describe('eos_configure tool', () => {
  const clientModule = jest.requireMock('../../../services/osc/client.js') as {
    getOscService: jest.Mock;
    resetOscClient: jest.Mock;
  };

  const serviceInstance = { reconfigure: mockReconfigure };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReconfigure.mockReset();
    mockGetDiagnostics.mockReset();
    clientModule.getOscService.mockReturnValue(serviceInstance);
    clientModule.resetOscClient.mockReturnValue({
      getDiagnostics: mockGetDiagnostics
    });
  });

  it('valide les arguments, reconfigure le service et renvoie un resume', async () => {
    mockReconfigure.mockResolvedValue(undefined);
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

    expect(clientModule.getOscService).toHaveBeenCalledTimes(1);
    expect(mockReconfigure).toHaveBeenCalledWith({
      remoteAddress: '10.1.0.5',
      remotePort: 9002,
      localPort: 7001
    });
    expect(clientModule.resetOscClient).toHaveBeenCalledWith(serviceInstance);
    expect(clientModule.resetOscClient).toHaveBeenCalledTimes(1);
    expect(mockGetDiagnostics).toHaveBeenCalledTimes(1);

    expect(result.content).toHaveLength(2);
    const [textContent, objectContent] = result.content;
    if (textContent.type !== 'text') {
      throw new Error('Le premier contenu doit etre du texte');
    }
    expect(textContent.text).toContain('10.1.0.5:9002');
    expect(textContent.text).toContain('Local : 0.0.0.0:7001');

    if (objectContent.type !== 'object') {
      throw new Error('Le second contenu doit etre un objet');
    }
    expect(objectContent.data).toEqual({ diagnostics });
  });

  it('rejette les configurations invalides', async () => {
    await expect(
      eosConfigureTool.handler({ remoteAddress: '', remotePort: 0, localPort: 0 })
    ).rejects.toThrow();
  });
});
