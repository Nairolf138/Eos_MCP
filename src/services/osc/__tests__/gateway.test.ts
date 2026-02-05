import { EventEmitter } from 'node:events';
import osc from 'osc';
import { createOscConnectionGateway } from '../gateway';
import type { OscMessage } from '../index';
import type { TransportStatus } from '../connectionManager';

type TransportType = 'tcp' | 'udp';

interface SendCall {
  toolId: string;
  transport: TransportType;
  payload: Buffer;
  targetAddress?: string;
  targetPort?: number;
}

const instances: Array<{
  transportSequence: TransportType[];
  toolPreferences: Map<string, string>;
  sendCalls: SendCall[];
  stopped: boolean;
  options: Record<string, unknown>;
  lastUdpSourcePort: number | null;
  emitMessage: (type: TransportType, data: Buffer, info?: { port?: number }) => void;
  emitStatus: (status: TransportStatus) => void;
}> = [];

jest.mock('../connectionManager.js', () => ({
  OscConnectionManager: class extends EventEmitter {
    public transportSequence: TransportType[] = [];

    public readonly toolPreferences = new Map<string, string>();

    public readonly sendCalls: SendCall[] = [];

    public stopped = false;

    public readonly options: Record<string, unknown>;

    public lastUdpSourcePort: number | null = null;

    public constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      instances.push(this);
    }

    public send(
      toolId: string,
      payload: Buffer,
      _encoding?: BufferEncoding,
      overrides?: { targetAddress?: string; targetPort?: number }
    ): TransportType {
      const transport = this.transportSequence.shift() ?? 'udp';
      this.sendCalls.push({
        toolId,
        transport,
        payload: Buffer.from(payload),
        targetAddress: overrides?.targetAddress,
        targetPort: overrides?.targetPort
      });
      return transport as TransportType;
    }

    public stop(): void {
      this.stopped = true;
    }

    public setToolPreference(toolId: string, preference: string): void {
      this.toolPreferences.set(toolId, preference);
    }

    public getToolPreference(toolId: string): string {
      return this.toolPreferences.get(toolId) ?? 'auto';
    }

    public removeTool(toolId: string): void {
      this.toolPreferences.delete(toolId);
    }

    public emitMessage(type: TransportType, data: Buffer, info?: { port?: number }): void {
      if (type === 'udp') {
        this.lastUdpSourcePort = info?.port ?? null;
      }
      this.emit('message', { type, data });
    }

    public emitStatus(status: TransportStatus): void {
      this.emit('status', status);
    }
  }
}));

describe('OscConnectionGateway', () => {
  beforeEach(() => {
    instances.length = 0;
  });

  it('bascule automatiquement vers un autre transport et emet les statuts', async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(0);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    expect(manager.options).toEqual(expect.objectContaining({ localPort: 8000 }));

    manager.transportSequence = ['tcp', 'udp'];

    const statuses: TransportStatus[] = [];
    gateway.onStatus?.((status) => {
      statuses.push(status);
    });

    await gateway.send({ address: '/test' }, { toolId: 'tool', transportPreference: 'reliability' });
    expect(manager.sendCalls).toHaveLength(1);
    expect(manager.sendCalls[0]?.transport).toBe('tcp');
    expect(manager.toolPreferences.get('tool')).toBe('reliability');

    manager.emitStatus({
      type: 'tcp',
      state: 'disconnected',
      lastHeartbeatAckAt: null,
      lastHeartbeatSentAt: null,
      consecutiveFailures: 1
    });

    manager.transportSequence = ['udp'];
    await gateway.send({ address: '/test' }, { toolId: 'tool' });
    expect(manager.sendCalls).toHaveLength(2);
    expect(manager.sendCalls[1]?.transport).toBe('udp');

    manager.emitStatus({
      type: 'udp',
      state: 'connected',
      lastHeartbeatAckAt: Date.now(),
      lastHeartbeatSentAt: Date.now(),
      consecutiveFailures: 0
    });

    expect(statuses).toEqual([
      expect.objectContaining({ type: 'tcp', state: 'disconnected' }),
      expect.objectContaining({ type: 'udp', state: 'connected' })
    ]);

    gateway.close();
  });

  it('transmet les cibles personnalisees au gestionnaire pour un envoi', async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    manager.transportSequence = ['udp'];

    await gateway.send(
      { address: '/custom/target' },
      { targetAddress: '192.0.2.15', targetPort: 5010 }
    );

    expect(manager.sendCalls).toHaveLength(1);
    const [call] = manager.sendCalls;
    expect(call?.targetAddress).toBe('192.0.2.15');
    expect(call?.targetPort).toBe(5010);

    gateway.close();
  });

  it('decode les messages OSC entrants et notifie les ecouteurs', async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const received: OscMessage[] = [];
    gateway.onMessage((message) => {
      received.push(message);
    });

    const packet = {
      address: '/demo',
      args: [
        {
          type: 's' as const,
          value: 'payload'
        }
      ]
    };
    const encoded = Buffer.from(osc.writePacket(packet, { metadata: true }) as Uint8Array);
    manager.emitMessage('udp', encoded);

    expect(received).toEqual([
      {
        address: '/demo',
        args: [{ type: 's', value: 'payload' }]
      }
    ]);

    gateway.close();
  });

  it("relaye les reponses de handshake en UDP meme lorsqu'elles proviennent d'un port different", () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const received: OscMessage[] = [];
    gateway.onMessage((message) => {
      received.push(message);
    });

    const handshakePacket = {
      address: '/eos/handshake/reply',
      args: [
        { type: 's' as const, value: 'ETCOSC!' },
        {
          type: 's' as const,
          value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
        }
      ]
    };

    const encoded = Buffer.from(
      osc.writePacket(handshakePacket, { metadata: true }) as Uint8Array
    );

    const configuredPort = (manager.options.udpPort as number) ?? 8001;
    const replyPort = configuredPort + 10;

    manager.emitMessage('udp', encoded, { port: replyPort });

    expect(manager.lastUdpSourcePort).toBe(replyPort);
    expect(received).toEqual([
      {
        address: '/eos/handshake/reply',
        args: [
          { type: 's', value: 'ETCOSC!' },
          {
            type: 's',
            value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
          }
        ]
      }
    ]);

    gateway.close();
  });

  it('relaye tous les messages contenus dans un bundle OSC', () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const received: OscMessage[] = [];
    gateway.onMessage((message) => {
      received.push(message);
    });

    const bundle = {
      timeTag: osc.timeTag(0),
      packets: [
        {
          address: '/eos/out/cmd',
          args: [
            { type: 's' as const, value: '1' },
            { type: 's' as const, value: 'Hello' }
          ]
        },
        {
          address: '/eos/handshake/reply',
          args: [
            { type: 's' as const, value: 'ETCOSC!' },
            {
              type: 's' as const,
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
            }
          ]
        }
      ]
    };

    const encoded = Buffer.from(osc.writePacket(bundle, { metadata: true }) as Uint8Array);
    manager.emitMessage('udp', encoded);

    expect(received).toEqual([
      {
        address: '/eos/out/cmd',
        args: [
          { type: 's', value: '1' },
          { type: 's', value: 'Hello' }
        ]
      },
      {
        address: '/eos/handshake/reply',
        args: [
          { type: 's', value: 'ETCOSC!' },
          {
            type: 's',
            value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
          }
        ]
      }
    ]);

    gateway.close();
  });

  it('preserve les ecouteurs lors de la reconfiguration', () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const initialManager = instances.at(-1);
    if (!initialManager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const received: OscMessage[] = [];
    const statuses: TransportStatus[] = [];

    gateway.onMessage((message) => {
      received.push(message);
    });

    gateway.onStatus((status) => {
      statuses.push(status);
    });

    gateway.reconfigure({
      host: '127.0.0.2',
      tcpPort: 4040,
      udpPort: 9001,
      localPort: 9000
    });

    const newManager = instances.at(-1);
    if (!newManager || newManager === initialManager) {
      throw new Error('Gestionnaire de connexion non reinitialise');
    }

    expect(initialManager.stopped).toBe(true);

    const packet = {
      address: '/reconfigure',
      args: [
        {
          type: 's' as const,
          value: 'preserved'
        }
      ]
    };
    const encoded = Buffer.from(osc.writePacket(packet, { metadata: true }) as Uint8Array);
    newManager.emitMessage('udp', encoded);

    const statusUpdate: TransportStatus = {
      type: 'udp',
      state: 'connected',
      lastHeartbeatAckAt: Date.now(),
      lastHeartbeatSentAt: Date.now(),
      consecutiveFailures: 0
    };
    newManager.emitStatus(statusUpdate);

    expect(received).toEqual([
      {
        address: '/reconfigure',
        args: [{ type: 's', value: 'preserved' }]
      }
    ]);
    expect(statuses).toEqual([expect.objectContaining({ type: 'udp', state: 'connected' })]);

    gateway.close();
  });

  it('transmet les options de liaison locales au gestionnaire de connexion', () => {
    createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8100,
      localAddress: '192.168.1.10'
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    expect(manager.options).toEqual(
      expect.objectContaining({ localPort: 8100, localAddress: '192.168.1.10' })
    );
  });

  it('configure un heartbeatResponseMatcher par defaut qui valide /eos/ping/reply', () => {
    createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      localPort: 8000
    });

    const manager = instances.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const matcher = manager.options.heartbeatResponseMatcher;
    expect(typeof matcher).toBe('function');

    const pingReply = Buffer.from(
      osc.writePacket({ address: '/eos/ping/reply', args: [] }, { metadata: true }) as Uint8Array
    );
    expect((matcher as (data: Buffer) => boolean)(pingReply)).toBe(true);

    const handshakeReply = Buffer.from(
      osc.writePacket({ address: '/eos/handshake/reply', args: [] }, { metadata: true }) as Uint8Array
    );
    expect((matcher as (data: Buffer) => boolean)(handshakeReply)).toBe(false);

    const pingBundle = Buffer.from(
      osc.writePacket(
        {
          timeTag: osc.timeTag(0),
          packets: [{ address: '/eos/ping/reply', args: [] }]
        },
        { metadata: true }
      ) as Uint8Array
    );
    expect((matcher as (data: Buffer) => boolean)(pingBundle)).toBe(true);

    expect((matcher as (data: Buffer) => boolean)(Buffer.from('invalid packet'))).toBe(false);
  });

  it('reinitialise les statistiques et le temps de fonctionnement lors de la reconfiguration', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      const gateway = createOscConnectionGateway({
        host: '127.0.0.1',
        tcpPort: 3032,
        udpPort: 8001,
        localPort: 8000
      });

      const initialManager = instances.at(-1);
      if (!initialManager) {
        throw new Error('Gestionnaire de connexion non initialise');
      }

      initialManager.transportSequence = ['udp'];

      jest.setSystemTime(new Date('2024-01-01T00:00:10.000Z'));
      await gateway.send({ address: '/initial' });

      const incomingPacket = {
        address: '/initial',
        args: [
          {
            type: 's' as const,
            value: 'payload'
          }
        ]
      };
      const encoded = Buffer.from(osc.writePacket(incomingPacket, { metadata: true }) as Uint8Array);
      initialManager.emitMessage('udp', encoded);

      jest.setSystemTime(new Date('2024-01-01T00:01:00.000Z'));
      const diagnosticsBefore = gateway.getDiagnostics();
      expect(diagnosticsBefore.uptimeMs).toBe(60_000);
      expect(diagnosticsBefore.stats.outgoing.count).toBe(1);
      expect(diagnosticsBefore.stats.incoming.count).toBe(1);

      jest.setSystemTime(new Date('2024-01-01T00:02:00.000Z'));
      gateway.reconfigure({
        host: '127.0.0.2',
        tcpPort: 4040,
        udpPort: 9001,
        localPort: 9000
      });

      const newManager = instances.at(-1);
      if (!newManager) {
        throw new Error('Gestionnaire de connexion non reinitialise');
      }

      expect(newManager).not.toBe(initialManager);

      jest.setSystemTime(new Date('2024-01-01T00:02:05.000Z'));
      const diagnosticsAfter = gateway.getDiagnostics();

      expect(diagnosticsAfter.uptimeMs).toBe(5_000);
      expect(diagnosticsAfter.stats.outgoing).toEqual(
        expect.objectContaining({ count: 0, bytes: 0, lastTimestamp: null, lastMessage: null })
      );
      expect(diagnosticsAfter.stats.incoming).toEqual(
        expect.objectContaining({ count: 0, bytes: 0, lastTimestamp: null, lastMessage: null })
      );
      expect(diagnosticsAfter.stats.outgoing.addresses).toEqual([]);
      expect(diagnosticsAfter.stats.incoming.addresses).toEqual([]);

      gateway.close();
    } finally {
      jest.useRealTimers();
    }
  });
});
