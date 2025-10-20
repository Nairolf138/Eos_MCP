import { ErrorCode } from '../../../server/errors';
import { OscClient, type ConnectResult } from '../client';
import type { OscGateway, OscGatewaySendOptions } from '../client';
import type { OscMessage } from '../index';

describe('OscClient', () => {
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

  it("retourne un statut timeout lorsque la console ne repond pas au handshake", async () => {
    jest.useFakeTimers();
    const service = new FakeOscService();
    const client = new OscClient(service);

    const promise = client.connect({ handshakeTimeoutMs: 10 });

    jest.advanceTimersByTime(11);

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
});
