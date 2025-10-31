import { EventEmitter } from 'events';
import type { Socket as TcpSocket } from 'net';
import type { Socket as UdpSocket } from 'node:dgram';
import { createSocket as createUdpSocket } from 'node:dgram';
import osc from 'osc';

jest.mock('node:dgram', () => {
  const actual = jest.requireActual('node:dgram');
  return {
    ...actual,
    createSocket: jest.fn()
  };
});

import { OscConnectionManager } from '../connectionManager';

describe('OscConnectionManager', () => {
  class MockTcpSocket extends EventEmitter {
    public readonly write = jest.fn((data: Buffer, callback?: (error?: Error) => void) => {
      callback?.();
      return true;
    });

    public readonly setKeepAlive = jest.fn();

    public readonly setTimeout = jest.fn(() => this);

    public readonly destroy = jest.fn(() => {
      this.emit('close');
      return this;
    });
  }

  class MockUdpSocket extends EventEmitter {
    public readonly send = jest.fn(
      (
        msg: Uint8Array | string,
        arg2?: number | ((error: Error | null, bytes: number) => void),
        arg3?: string | ((error: Error | null, bytes: number) => void),
        arg4?: (error: Error | null, bytes: number) => void
      ) => {
        const callback =
          typeof arg2 === 'function'
            ? arg2
            : typeof arg3 === 'function'
              ? arg3
              : arg4;
        const bytes = typeof msg === 'string' ? Buffer.byteLength(msg) : msg.length;
        callback?.(null, bytes);
      }
    );

    public readonly close = jest.fn(() => {
      this.emit('close');
    });

    public readonly connect = jest.fn(
      (_port: number, _host: string, callback?: () => void) => {
        callback?.();
      }
    );
  }

  afterEach(() => {
    jest.useRealTimers();
    jest.mocked(createUdpSocket).mockReset();
  });

  const framePacket = (payload: Buffer): Buffer => {
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeUInt32BE(payload.length, 0);
    return Buffer.concat([lengthPrefix, payload]);
  };

  it('frames TCP payloads with a length prefix before sending', async () => {
    let createdTcpSocket: MockTcpSocket | null = null;
    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      createdTcpSocket = socket;
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => new MockUdpSocket() as unknown as UdpSocket);

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 1_000,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    await Promise.resolve();

    const socket = createdTcpSocket;
    if (!socket) {
      throw new Error('TCP socket not created');
    }

    socket.write.mockClear();

    const payload = Buffer.from('hello world');
    const transportUsed = manager.send('tool-123', payload);

    expect(transportUsed).toBe('tcp');
    expect(socket.write).toHaveBeenCalledTimes(1);

    const [framedBuffer] = socket.write.mock.calls[0];
    if (!Buffer.isBuffer(framedBuffer)) {
      throw new Error('Expected framed buffer to be a Buffer instance');
    }

    expect(framedBuffer.length).toBe(payload.length + 4);
    expect(framedBuffer.readUInt32BE(0)).toBe(payload.length);
    expect(framedBuffer.subarray(4)).toEqual(payload);

    manager.stop();
  });

  it('envoie les paquets UDP vers une destination personnalisee lorsqu\'elle est fournie', async () => {
    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    let createdUdpSocket: MockUdpSocket | null = null;
    const createUdpSocket = jest.fn(() => {
      const socket = new MockUdpSocket();
      createdUdpSocket = socket;
      return socket as unknown as UdpSocket;
    });

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 1_000,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    await Promise.resolve();

    const udpSocket = createdUdpSocket;
    if (!udpSocket) {
      throw new Error('UDP socket not created');
    }

    manager.setToolPreference('udp-tool', 'speed');

    udpSocket.send.mockClear();

    const payload = Buffer.from('udp override');
    manager.send('udp-tool', payload, undefined, {
      targetAddress: '198.51.100.10',
      targetPort: 9123
    });

    expect(udpSocket.send).toHaveBeenCalledTimes(1);
    const [buffer, port, host] = udpSocket.send.mock.calls[0];

    expect(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).toEqual(payload);
    expect(port).toBe(9123);
    expect(host).toBe('198.51.100.10');

    manager.stop();
  });

  it('applies exponential backoff when scheduling reconnections', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const tcpSockets: MockTcpSocket[] = [];
    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      tcpSockets.push(socket);
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => new MockUdpSocket() as unknown as UdpSocket);

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 1_000,
      connectionTimeoutMs: 500,
      reconnectBackoff: {
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 1_000,
        jitter: 0
      },
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    expect(createTcpSocket).toHaveBeenCalledTimes(1);

    const firstSocket = tcpSockets[0];
    if (!firstSocket) {
      throw new Error('First TCP socket not created');
    }

    firstSocket.emit('error', new Error('first failure'));

    jest.advanceTimersByTime(99);
    expect(createTcpSocket).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(createTcpSocket).toHaveBeenCalledTimes(2);

    const secondSocket = tcpSockets[1];
    if (!secondSocket) {
      throw new Error('Second TCP socket not created');
    }

    secondSocket.emit('error', new Error('second failure'));

    jest.advanceTimersByTime(199);
    expect(createTcpSocket).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(createTcpSocket).toHaveBeenCalledTimes(3);

    const thirdSocket = tcpSockets[2];
    if (!thirdSocket) {
      throw new Error('Third TCP socket not created');
    }

    thirdSocket.emit('error', new Error('third failure'));

    jest.advanceTimersByTime(399);
    expect(createTcpSocket).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(1);
    expect(createTcpSocket).toHaveBeenCalledTimes(4);

    manager.stop();
    jest.runOnlyPendingTimers();
  });

  it('stops reconnect attempts when the reconnection timeout is exceeded', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const tcpSockets: MockTcpSocket[] = [];
    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      tcpSockets.push(socket);
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => new MockUdpSocket() as unknown as UdpSocket);

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 1_000,
      connectionTimeoutMs: 500,
      reconnectBackoff: {
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 1_000,
        jitter: 0
      },
      reconnectTimeoutMs: 250,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    expect(createTcpSocket).toHaveBeenCalledTimes(1);

    const firstSocket = tcpSockets[0];
    if (!firstSocket) {
      throw new Error('First TCP socket not created');
    }
    firstSocket.emit('error', new Error('initial failure'));

    jest.advanceTimersByTime(100);
    expect(createTcpSocket).toHaveBeenCalledTimes(2);

    const secondSocket = tcpSockets[1];
    if (!secondSocket) {
      throw new Error('Second TCP socket not created');
    }
    secondSocket.emit('error', new Error('second failure'));

    jest.advanceTimersByTime(1_000);
    expect(createTcpSocket).toHaveBeenCalledTimes(2);

    manager.stop();
    jest.runOnlyPendingTimers();
  });

  it('reconnects the TCP transport when heartbeats are not acknowledged', async () => {
    jest.useFakeTimers();

    const tcpSockets: MockTcpSocket[] = [];
    const udpSockets: MockUdpSocket[] = [];

    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      tcpSockets.push(socket);
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => {
      const socket = new MockUdpSocket();
      udpSockets.push(socket);
      return socket as unknown as UdpSocket;
    });

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 300,
      connectionTimeoutMs: 200,
      reconnectDelayMs: 100,
      heartbeatResponseMatcher: () => false,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    await Promise.resolve();
    expect(createTcpSocket).toHaveBeenCalledTimes(1);

    const firstTcpSocket = tcpSockets[0];
    if (!firstTcpSocket) {
      throw new Error('Mock TCP socket not created');
    }

    jest.advanceTimersByTime(200);
    expect(firstTcpSocket.write).toHaveBeenCalled();
    expect(createTcpSocket).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    expect(createTcpSocket).toHaveBeenCalledTimes(2);

    manager.stop();
    jest.runOnlyPendingTimers();
  });

  it('buffers TCP frames and emits complete OSC packets individually', () => {
    const tcpSockets: MockTcpSocket[] = [];
    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      tcpSockets.push(socket);
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => new MockUdpSocket() as unknown as UdpSocket);

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 500,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    const socket = tcpSockets[0];
    if (!socket) {
      throw new Error('TCP socket not created');
    }

    socket.emit('connect');

    const firstPacket = Buffer.from(
      osc.writePacket(
        {
          address: '/first',
          args: [{ type: 's', value: 'alpha' }]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const secondPacket = Buffer.from(
      osc.writePacket(
        {
          address: '/second',
          args: [{ type: 'i', value: 42 }]
        },
        { metadata: true }
      ) as Uint8Array
    );

    const framedFirst = framePacket(firstPacket);
    const framedSecond = framePacket(secondPacket);

    const messages: Buffer[] = [];
    manager.on('message', (event) => {
      if (event.type === 'tcp') {
        messages.push(Buffer.from(event.data));
      }
    });

    socket.emit('data', framedFirst.subarray(0, 6));
    expect(messages).toHaveLength(0);

    socket.emit('data', Buffer.concat([framedFirst.subarray(6), framedSecond]));

    expect(messages).toHaveLength(2);
    const decoded = messages.map((message) =>
      osc.readPacket(message, { metadata: true }) as { address: string; args: Array<{ type: string; value: unknown }> }
    );

    expect(decoded).toEqual([
      {
        address: '/first',
        args: [{ type: 's', value: 'alpha' }]
      },
      {
        address: '/second',
        args: [{ type: 'i', value: 42 }]
      }
    ]);

    manager.stop();
  });

  it('falls back to UDP when TCP becomes unavailable for reliability preference', async () => {
    const tcpSockets: MockTcpSocket[] = [];
    const udpSockets: MockUdpSocket[] = [];

    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      tcpSockets.push(socket);
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    const createUdpSocket = jest.fn(() => {
      const socket = new MockUdpSocket();
      udpSockets.push(socket);
      return socket as unknown as UdpSocket;
    });

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 5_000,
      reconnectDelayMs: 50,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    await Promise.resolve();
    await Promise.resolve();

    manager.setToolPreference('snapshot', 'reliability');

    const tcpSocket = tcpSockets[0];
    const udpSocket = udpSockets[0];
    if (!tcpSocket || !udpSocket) {
      throw new Error('Mock sockets not created');
    }

    tcpSocket.emit('error', new Error('boom'));
    await Promise.resolve();

    const previousCalls = udpSocket.send.mock.calls.length;
    const transportUsed = manager.send('snapshot', 'hello');

    expect(transportUsed).toBe('udp');

    const lastCall = udpSocket.send.mock.calls[udpSocket.send.mock.calls.length - 1];
    expect(udpSocket.send.mock.calls.length).toBeGreaterThan(previousCalls);
    expect(Buffer.isBuffer(lastCall[0])).toBe(true);
    expect((lastCall[0] as Buffer).toString()).toBe('hello');
    expect(lastCall[1]).toBe(9001);
    expect(lastCall[2]).toBe('127.0.0.1');

    expect(manager.getActiveTransport('snapshot')).toBe('udp');

    manager.stop();
  });

  it('binds the UDP socket to the configured local endpoint', async () => {
    const order: string[] = [];

    class BoundUdpSocket extends EventEmitter {
      public readonly bind = jest.fn(
        (options: Parameters<UdpSocket['bind']>[0], callback?: () => void) => {
          order.push('bind');
          callback?.();
          return this as unknown as UdpSocket;
        }
      );

      public readonly send = jest.fn();

      public readonly close = jest.fn(() => {
        this.emit('close');
      });
    }

    const udpSocket = new BoundUdpSocket();
    jest.mocked(createUdpSocket).mockReturnValueOnce(udpSocket as unknown as UdpSocket);

    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    const manager = new OscConnectionManager({
      host: '192.0.2.5',
      tcpPort: 9000,
      udpPort: 9100,
      localAddress: '0.0.0.0',
      localPort: 9200,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 5_000,
      reconnectDelayMs: 50,
      createTcpSocket,
      logger: {}
    });

    await Promise.resolve();

    expect(order).toEqual(['bind']);
    expect(udpSocket.bind).toHaveBeenCalledWith(
      expect.objectContaining({ address: '0.0.0.0', port: 9200 }),
      expect.any(Function)
    );

    expect(manager.getStatus('udp').state).toBe('connected');

    manager.stop();
  });

  it('emits UDP messages even when they originate from a different remote port', async () => {
    class FilteringUdpSocket extends EventEmitter {
      public readonly bind = jest.fn(
        (_options: Parameters<UdpSocket['bind']>[0], callback?: () => void) => {
          callback?.();
          return this as unknown as UdpSocket;
        }
      );

      public readonly send = jest.fn(
        (
          msg: Uint8Array | string,
          arg2?: number | ((error: Error | null, bytes: number) => void),
          arg3?: string | ((error: Error | null, bytes: number) => void),
          arg4?: (error: Error | null, bytes: number) => void
        ) => {
          const callback =
            typeof arg2 === 'function'
              ? arg2
              : typeof arg3 === 'function'
                ? arg3
                : arg4;
          const bytes = typeof msg === 'string' ? Buffer.byteLength(msg) : msg.length;
          callback?.(null, bytes);
        }
      );

      public readonly close = jest.fn(() => {
        this.emit('close');
      });

      public deliver(message: Buffer, port: number): void {
        this.emit('message', message, {
          address: '127.0.0.1',
          family: 'IPv4',
          port,
          size: message.length
        });
      }
    }

    const udpSockets: FilteringUdpSocket[] = [];
    const createUdpSocket = jest.fn(() => {
      const socket = new FilteringUdpSocket();
      udpSockets.push(socket);
      return socket as unknown as UdpSocket;
    });

    const createTcpSocket = jest.fn(() => {
      const socket = new MockTcpSocket();
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as TcpSocket;
    });

    const manager = new OscConnectionManager({
      host: '127.0.0.1',
      tcpPort: 9000,
      udpPort: 9001,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 5_000,
      reconnectDelayMs: 50,
      createTcpSocket,
      createUdpSocket,
      logger: {}
    });

    await Promise.resolve();

    const udpSocket = udpSockets[0];
    if (!udpSocket) {
      throw new Error('UDP socket not created');
    }

    const received: Buffer[] = [];
    manager.on('message', (event) => {
      if (event.type === 'udp') {
        received.push(Buffer.from(event.data));
      }
    });

    const handshake = Buffer.from(
      osc.writePacket(
        {
          address: '/eos/handshake/reply',
          args: [
            { type: 's', value: 'ETCOSC!' },
            {
              type: 's',
              value: JSON.stringify({ version: '3.2.0', protocols: ['tcp', 'udp'] })
            }
          ]
        },
        { metadata: true }
      ) as Uint8Array
    );

    udpSocket.deliver(handshake, 9100);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(handshake);

    manager.stop();
  });
});
