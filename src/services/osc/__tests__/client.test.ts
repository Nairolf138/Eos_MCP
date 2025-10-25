import { EventEmitter } from 'node:events';
import osc from 'osc';
import { ErrorCode } from '../../../server/errors';
import { OscClient, type ConnectResult } from '../client';
import type { OscGateway, OscGatewaySendOptions } from '../client';
import { createOscConnectionGateway } from '../gateway';
import type { OscMessage } from '../index';

type TransportType = 'tcp' | 'udp';

type TransportState = 'disconnected' | 'connecting' | 'connected';

interface TransportStatus {
  type: TransportType;
  state: TransportState;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  consecutiveFailures: number;
}

interface SendCall {
  toolId: string;
  payload: Buffer;
  transport: TransportType;
}

interface MockConnectionManager extends EventEmitter {
  ready: boolean;
  stopped: boolean;
  options: Record<string, unknown>;
  toolPreferences: Map<string, string>;
  sendCalls: SendCall[];
  emitMessage(type: TransportType, data: Buffer): void;
  emitStatus(status: TransportStatus): void;
  getStatus(type: TransportType): TransportStatus;
  stop(): void;
  setToolPreference(toolId: string, preference: string): void;
  getToolPreference(toolId: string): string;
  removeTool(toolId: string): void;
}

const gatewayManagers: MockConnectionManager[] = [];

jest.mock('../connectionManager.js', () => {
  return {
    OscConnectionManager: class extends EventEmitter {
      public readonly options: Record<string, unknown>;

      public readonly toolPreferences = new Map<string, string>();

      public readonly sendCalls: SendCall[] = [];

      public stopped = false;

      public ready = false;

      private readonly statuses: Record<TransportType, TransportStatus> = {
        tcp: {
          type: 'tcp',
          state: 'connecting',
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
      };

      public constructor(options: Record<string, unknown>) {
        super();
        this.options = options;
        gatewayManagers.push(this as unknown as MockConnectionManager);
      }

      public send(toolId: string, payload: Buffer): TransportType {
        const buffer = Buffer.isBuffer(payload) ? Buffer.from(payload) : Buffer.from(payload as Buffer);
        this.sendCalls.push({ toolId, payload: buffer, transport: 'tcp' });
        if (!this.ready) {
          throw new Error(
            "Aucun transport OSC disponible pour l'outil. Les connexions TCP et UDP sont indisponibles."
          );
        }
        return 'tcp';
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

      public emitMessage(type: TransportType, data: Buffer): void {
        this.emit('message', { type, data });
      }

      public emitStatus(status: TransportStatus): void {
        this.statuses[status.type] = { ...status };
        this.emit('status', status);
      }

      public getStatus(type: TransportType): TransportStatus {
        return { ...this.statuses[type] };
      }
    }
  };
});

describe('OscClient', () => {
  function decodeOscAddress(payload: Buffer): string {
    const packet = osc.readPacket(payload, { metadata: true });
    if (!packet || typeof packet !== 'object' || packet === null) {
      throw new Error('Paquet OSC inattendu');
    }

    const message = packet as { address?: unknown };
    if (typeof message.address !== 'string') {
      throw new Error('Adresse OSC manquante');
    }

    return message.address;
  }

  class FakeOscService implements OscGateway {
    public readonly sentMessages: OscMessage[] = [];

    private readonly listeners = new Set<(message: OscMessage) => void>();

    public delayMs = 0;

    public activeSends = 0;

    public maxActiveSends = 0;

    public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
      this.activeSends += 1;
      this.maxActiveSends = Math.max(this.maxActiveSends, this.activeSends);
      this.sentMessages.push(message);
      if (this.delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
      }
      this.activeSends -= 1;
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
  }

  afterEach(() => {
    jest.useRealTimers();
    gatewayManagers.splice(0, gatewayManagers.length);
  });

  it('realise un handshake et selectionne le protocole prefere', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const connectPromise = client.connect({ preferredProtocols: ['udp', 'tcp'] });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/handshake/reply',
        args: [
          {
            type: 's',
            value: JSON.stringify({ version: '3.2.0', protocols: ['udp', 'tcp'] })
          }
        ]
      });

      setTimeout(() => {
        service.emit({
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        });
      }, 0);
    });

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('udp');
    expect(result.protocolStatus).toBe('ok');
    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/eos/handshake',
      '/eos/protocol/select'
    ]);
  });

  it("demarre le timeout du handshake uniquement une fois l'envoi effectue", async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    service.delayMs = 40;
    const client = new OscClient(service);

    const connectPromise = client.connect({ preferredProtocols: ['tcp'], handshakeTimeoutMs: 50 });

    queueMicrotask(() => {
      setTimeout(() => {
        service.emit({
          address: '/eos/handshake/reply',
          args: [
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp'] })
            }
          ]
        });

        queueMicrotask(() => {
          service.emit({
            address: '/eos/protocol/select/reply',
            args: [{ type: 's', value: 'ok' }]
          });
        });
      }, 45);
    });

    await jest.advanceTimersByTimeAsync(45);
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(50);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('tcp');
    expect(result.protocolStatus).toBe('ok');
  });

  it("retourne un statut timeout lorsque la console ne repond pas au handshake", async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.connect({ handshakeTimeoutMs: 10 });

    await jest.advanceTimersByTimeAsync(11);

    await expect(promise).resolves.toMatchObject<Partial<ConnectResult>>({
      status: 'timeout',
      availableProtocols: [],
      version: null,
      error: expect.stringContaining('expire')
    });
  });

  it('retourne le statut du ping et l\'echo', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const pingPromise = client.ping({ message: 'hello' });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/ping/reply',
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', echo: 'hello' })
          }
        ]
      });
    });

    const result = await pingPromise;

    expect(result.status).toBe('ok');
    expect(result.echo).toBe('hello');
    expect(result.roundtripMs).not.toBeNull();
    expect(service.sentMessages[0]?.address).toBe('/eos/ping');
  });

  it('indique un timeout sur le ping lorsque la console ne repond pas', async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.ping({ timeoutMs: 5 });

    jest.advanceTimersByTime(6);

    await expect(promise).resolves.toMatchObject({
      status: 'timeout',
      error: expect.stringContaining('expire')
    });
  });

  it('signale une connexion perdue pendant un ping', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const pingPromise = client.ping();

    queueMicrotask(() => {
      service.emit({
        address: '/eos/ping/reply',
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'error', message: 'Connection lost to console' })
          }
        ]
      });
    });

    await expect(pingPromise).resolves.toMatchObject({
      status: 'error',
      error: expect.stringContaining('Connexion OSC perdue')
    });
  });

  it('confirme la souscription OSC', async () => {
    const service = new FakeOscService();
    const client = new OscClient(service);

    const subscribePromise = client.subscribe({ path: '/eos/out/ping', rateHz: 5 });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/subscribe/reply',
        args: [{ type: 's', value: 'ok' }]
      });
    });

    const result = await subscribePromise;

    expect(result.status).toBe('ok');
    expect(result.path).toBe('/eos/out/ping');
    expect(service.sentMessages[0]?.address).toBe('/eos/subscribe');
  });

  it('gere les envois simultanes via la file', async () => {
    const service = new FakeOscService();
    service.delayMs = 10;
    const client = new OscClient(service, { requestConcurrency: 1, queueTimeoutMs: 100 });

    await Promise.all([
      client.sendMessage('/test/1'),
      client.sendMessage('/test/2'),
      client.sendMessage('/test/3')
    ]);

    expect(service.sentMessages.map((message) => message.address)).toEqual([
      '/test/1',
      '/test/2',
      '/test/3'
    ]);
    expect(service.maxActiveSends).toBe(1);
  });

  it('respecte la limite de concurrence configuree', async () => {
    const service = new FakeOscService();
    service.delayMs = 10;
    const client = new OscClient(service, { requestConcurrency: 2, queueTimeoutMs: 100 });

    await Promise.all([
      client.sendMessage('/test/a'),
      client.sendMessage('/test/b'),
      client.sendMessage('/test/c'),
      client.sendMessage('/test/d')
    ]);

    expect(service.sentMessages).toHaveLength(4);
    expect(service.maxActiveSends).toBeLessThanOrEqual(2);
  });

  it('declenche un timeout si la console ne repond pas avant la limite', async () => {
    const service = new FakeOscService();
    service.delayMs = 50;
    const client = new OscClient(service, { requestConcurrency: 1, queueTimeoutMs: 10 });

    await expect(client.sendMessage('/test/timeout')).rejects.toMatchObject({
      code: ErrorCode.OSC_TIMEOUT
    });
  });

  it("reessaye le handshake lorsqu'aucun transport n'est encore pret", async () => {
    const gateway = createOscConnectionGateway({
      host: '127.0.0.1',
      tcpPort: 3032,
      udpPort: 8001,
      connectionTimeoutMs: 100
    });

    const manager = gatewayManagers.at(-1);
    if (!manager) {
      throw new Error('Gestionnaire de connexion non initialise');
    }

    const client = new OscClient(gateway);

    const handshakeReply = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/handshake/reply',
          args: [
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
            }
          ]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const protocolReply = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/protocol/select/reply',
          args: [{ type: 's', value: 'ok' }]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const connectPromise = client.connect({ preferredProtocols: ['tcp', 'udp'] });

    setTimeout(() => {
      manager.ready = true;
      manager.emitStatus({
        type: 'tcp',
        state: 'connected',
        lastHeartbeatAckAt: Date.now(),
        lastHeartbeatSentAt: Date.now(),
        consecutiveFailures: 0
      });

      setTimeout(() => {
        manager.emitMessage('tcp', handshakeReply);

        setTimeout(() => {
          manager.emitMessage('tcp', protocolReply);
        }, 0);
      }, 0);
    }, 0);

    const result = await connectPromise;

    expect(result.status).toBe('ok');
    expect(result.version).toBe('3.2.0');
    expect(result.selectedProtocol).toBe('tcp');
    expect(result.protocolStatus).toBe('ok');

    expect(manager.sendCalls.map((call) => decodeOscAddress(call.payload))).toEqual([
      '/eos/handshake',
      '/eos/handshake',
      '/eos/protocol/select'
    ]);

    gateway.close?.();
  });
});
