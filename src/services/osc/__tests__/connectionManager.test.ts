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
      (msg: Uint8Array | string, callback?: (error: Error | null, bytes: number) => void) => {
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

    expect(manager.getActiveTransport('snapshot')).toBe('udp');

    manager.stop();
  });

  it('binds the UDP socket to the configured local endpoint before connecting', async () => {
    const order: string[] = [];

    class BoundUdpSocket extends EventEmitter {
      public readonly bind = jest.fn(
        (options: Parameters<UdpSocket['bind']>[0], callback?: () => void) => {
          order.push('bind');
          callback?.();
          return this as unknown as UdpSocket;
        }
      );

      public readonly connect = jest.fn(
        (port: number, host: string, callback?: () => void) => {
          order.push('connect');
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

    const manager = new OscConnectionManager({
      host: '192.0.2.5',
      tcpPort: 9000,
      udpPort: 9100,
      localAddress: '0.0.0.0',
      localPort: 9200,
      heartbeatIntervalMs: 10_000,
      connectionTimeoutMs: 5_000,
      reconnectDelayMs: 50,
      logger: {}
    });

    await Promise.resolve();

    expect(order).toEqual(['bind', 'connect']);
    expect(udpSocket.bind).toHaveBeenCalledWith(
      expect.objectContaining({ address: '0.0.0.0', port: 9200 }),
      expect.any(Function)
    );
    expect(udpSocket.connect).toHaveBeenCalledWith(9100, '192.0.2.5', expect.any(Function));

    manager.stop();
  });
});
