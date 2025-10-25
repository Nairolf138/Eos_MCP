import { EventEmitter } from 'events';
import { OscService } from '../index';

type MockHandler = jest.Mock<void, [unknown?]>;

interface MockUdpPort extends EventEmitter {
  options: Record<string, unknown>;
  send: MockHandler;
  close: MockHandler;
  open: MockHandler;
}

declare module 'osc' {
  interface __MockModule {
    instances: MockUdpPort[];
    reset(): void;
  }

  const __mock: __MockModule;
}

jest.mock('osc', () => {
  const instances: MockUdpPort[] = [];

  class MockUdpPortImpl extends EventEmitter {
    public readonly options: Record<string, unknown>;
    public readonly send: MockHandler;
    public readonly close: MockHandler;
    public readonly open: MockHandler;

    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      this.send = jest.fn();
      this.close = jest.fn();
      this.open = jest.fn();
      instances.push(this as unknown as MockUdpPort);
    }
  }

  return {
    UDPPort: jest.fn((options: Record<string, unknown>) => new MockUdpPortImpl(options)),
    __mock: {
      instances,
      reset: () => {
        instances.splice(0, instances.length);
      }
    }
  };
});

describe('OscService diagnostics', () => {
  const oscModule = jest.requireMock('osc') as {
    __mock: {
      instances: MockUdpPort[];
      reset: () => void;
    };
  };

  const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    oscModule.__mock.reset();
    jest.clearAllMocks();
  });

  const createService = (): { service: OscService; port: MockUdpPort } => {
    const service = new OscService({ localPort: 9000, remotePort: 9001, remoteAddress: '127.0.0.1', logger });
    const port = oscModule.__mock.instances[oscModule.__mock.instances.length - 1];
    if (!port) {
      throw new Error('Le port OSC simule est introuvable');
    }
    return { service, port };
  };

  it('met a jour le logging et consigne les changements', () => {
    const { service } = createService();

    try {
      const state = service.setLoggingOptions({ incoming: true });

      expect(state).toEqual({ incoming: true, outgoing: false });
      expect(logger.info).toHaveBeenLastCalledWith(
        expect.stringContaining('entrant: active')
      );

      const nextState = service.setLoggingOptions({ outgoing: true });
      expect(nextState).toEqual({ incoming: true, outgoing: true });
    } finally {
      service.close();
    }
  });

  it('agrège les statistiques des messages entrants et sortants', async () => {
    const { service, port } = createService();

    try {
      service.setLoggingOptions({ incoming: true, outgoing: true });
      await service.send({ address: '/test/out', args: [{ type: 'i', value: 1 }] });

      expect(logger.debug).toHaveBeenCalledWith(
        { args: [{ type: 'i', value: 1 }] },
        '[OSC] -> /test/out'
      );

      port.emit('message', { address: '/test/in', args: [{ type: 's', value: 'hello' }] });

      expect(logger.debug).toHaveBeenCalledWith(
        { args: [{ type: 's', value: 'hello' }] },
        '[OSC] <- /test/in'
      );

      const diagnostics = service.getDiagnostics();

      expect(diagnostics.stats.outgoing.count).toBe(1);
      expect(diagnostics.stats.outgoing.addresses[0]).toMatchObject({
        address: '/test/out',
        count: 1
      });
      expect(diagnostics.stats.incoming.count).toBe(1);
      expect(diagnostics.stats.incoming.addresses[0]).toMatchObject({
        address: '/test/in',
        count: 1
      });
      expect(diagnostics.logging).toEqual({ incoming: true, outgoing: true });
      expect(diagnostics.listeners.active).toBe(0);
      expect(diagnostics.uptimeMs).toBeGreaterThanOrEqual(0);
    } finally {
      service.close();
    }
  });

  it('ferme et recree le port lors de la reconfiguration', async () => {
    const { service, port } = createService();

    try {
      const initialInstanceCount = oscModule.__mock.instances.length;

      await service.reconfigure({
        remoteAddress: '10.0.0.5',
        remotePort: 9100,
        localPort: 9200
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Reconfiguration OSC demandee')
      );

      expect(port.close).toHaveBeenCalledTimes(1);
      expect(oscModule.__mock.instances.length).toBe(initialInstanceCount + 1);

      const newPort = oscModule.__mock.instances[oscModule.__mock.instances.length - 1];
      expect(newPort).not.toBe(port);
      expect(newPort.options).toMatchObject({
        localAddress: '0.0.0.0',
        localPort: 9200,
        remoteAddress: '10.0.0.5',
        remotePort: 9100,
        metadata: true
      });
      expect(newPort.open).toHaveBeenCalledTimes(1);

      await service.send({ address: '/after/reconfigure' });

      expect(newPort.send).toHaveBeenCalledWith(
        expect.objectContaining({ address: '/after/reconfigure' }),
        '10.0.0.5',
        9100
      );

      const diagnostics = service.getDiagnostics();
      expect(diagnostics.config).toMatchObject({
        localAddress: '0.0.0.0',
        localPort: 9200,
        remoteAddress: '10.0.0.5',
        remotePort: 9100
      });
    } finally {
      service.close();
    }
  });
});
