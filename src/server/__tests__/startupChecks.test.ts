import net, { type AddressInfo } from 'node:net';
import dgram, { type SocketType } from 'node:dgram';
import { assertTcpPortAvailable, assertUdpPortAvailable } from '../startupChecks';
import { ErrorCode } from '../errors';

async function getFreeTcpPort(): Promise<number> {
  const server = net.createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: 0, host: '0.0.0.0' }, () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return port;
}

async function getFreeUdpPort(address: string, type: SocketType): Promise<number> {
  const socket = dgram.createSocket(type);
  const port = await new Promise<number>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind({ port: 0, address }, () => {
      const info = socket.address();
      resolve(info.port);
    });
  });

  await new Promise<void>((resolve) => {
    socket.close(() => resolve());
  });

  return port;
}

async function bindUdpSocket(
  address: string,
  type: SocketType,
  port?: number
): Promise<dgram.Socket> {
  const socket = dgram.createSocket(type);
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind({ address, port: port ?? 0 }, () => resolve());
  });
  return socket;
}

describe('startupChecks', () => {
  describe('assertTcpPortAvailable', () => {
    it('resolves when the TCP port is free and releases it afterwards', async () => {
      const port = await getFreeTcpPort();

      await expect(assertTcpPortAvailable(port, '0.0.0.0')).resolves.toBeUndefined();

      await new Promise<void>((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen({ port, host: '0.0.0.0' }, () => {
          probe.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      });
    });

    it('rejects with an AppError when the TCP port is in use', async () => {
      const blocker = net.createServer();
      await new Promise<void>((resolve, reject) => {
        blocker.once('error', reject);
        blocker.listen({ port: 0, host: '0.0.0.0' }, () => resolve());
      });

      const port = (blocker.address() as AddressInfo).port;

      await expect(assertTcpPortAvailable(port, '0.0.0.0')).rejects.toMatchObject({
        code: ErrorCode.MCP_STARTUP_FAILURE,
        name: 'AppError'
      });

      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });
  });

  describe('assertUdpPortAvailable', () => {
    it('resolves when the IPv4 UDP port is free and releases it afterwards', async () => {
      const port = await getFreeUdpPort('127.0.0.1', 'udp4');

      await expect(assertUdpPortAvailable(port, '127.0.0.1')).resolves.toBeUndefined();

      const probe = await bindUdpSocket('127.0.0.1', 'udp4', port);
      await new Promise<void>((resolve, reject) => {
        probe.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });

    it('rejects with an AppError when the IPv4 UDP port is in use', async () => {
      const blocker = await bindUdpSocket('127.0.0.1', 'udp4');

      try {
        const port = blocker.address().port;

        await expect(assertUdpPortAvailable(port, '127.0.0.1')).rejects.toMatchObject({
          code: ErrorCode.MCP_STARTUP_FAILURE,
          name: 'AppError'
        });
      } finally {
        await new Promise<void>((resolve) => {
          blocker.close(() => resolve());
        });
      }
    });

    it('resolves when the IPv6 UDP port is free and releases it afterwards', async () => {
      const port = await getFreeUdpPort('::1', 'udp6');

      await expect(assertUdpPortAvailable(port, '::1')).resolves.toBeUndefined();

      const probe = await bindUdpSocket('::1', 'udp6', port);
      await new Promise<void>((resolve, reject) => {
        probe.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });

    it('rejects with an AppError when the IPv6 UDP port is in use', async () => {
      const blocker = await bindUdpSocket('::1', 'udp6');

      try {
        const port = blocker.address().port;

        await expect(assertUdpPortAvailable(port, '::1')).rejects.toMatchObject({
          code: ErrorCode.MCP_STARTUP_FAILURE,
          name: 'AppError'
        });
      } finally {
        await new Promise<void>((resolve) => {
          blocker.close(() => resolve());
        });
      }
    });

    it('considers interface-specific bindings for IPv4 addresses', async () => {
      const blocker = await bindUdpSocket('127.0.0.2', 'udp4');

      try {
        const port = blocker.address().port;

        await expect(assertUdpPortAvailable(port, '127.0.0.1')).resolves.toBeUndefined();
      } finally {
        await new Promise<void>((resolve) => {
          blocker.close(() => resolve());
        });
      }
    });

    it('allows IPv6 checks when an IPv4 socket already uses the port', async () => {
      const blocker = await bindUdpSocket('0.0.0.0', 'udp4');

      try {
        const port = blocker.address().port;

        await expect(assertUdpPortAvailable(port, '::1')).resolves.toBeUndefined();
      } finally {
        await new Promise<void>((resolve) => {
          blocker.close(() => resolve());
        });
      }
    });
  });
});
