import { EventEmitter } from 'events';
import type { Socket as TcpSocket } from 'net';
import type { Socket as UdpSocket } from 'dgram';

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
});
