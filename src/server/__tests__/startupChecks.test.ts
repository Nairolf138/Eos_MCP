import net, { type AddressInfo } from 'node:net';
import dgram from 'node:dgram';
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

async function getFreeUdpPort(): Promise<number> {
  const socket = dgram.createSocket('udp4');
  const port = await new Promise<number>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind({ port: 0, address: '0.0.0.0' }, () => {
      const address = socket.address();
      resolve(address.port);
    });
  });

  await new Promise<void>((resolve) => {
    socket.close(() => resolve());
  });

  return port;
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
    it('resolves when the UDP port is free and releases it afterwards', async () => {
      const port = await getFreeUdpPort();

      await expect(assertUdpPortAvailable(port, '0.0.0.0')).resolves.toBeUndefined();

      await new Promise<void>((resolve, reject) => {
        const probe = dgram.createSocket('udp4');
        const onError = (error: Error) => {
          probe.off('error', onError);
          probe.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          probe.off('error', onError);
          probe.off('listening', onListening);
          probe.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        };
        probe.once('error', onError);
        probe.once('listening', onListening);
        probe.bind({ port, address: '0.0.0.0' });
      });
    });

    it('rejects with an AppError when the UDP port is in use', async () => {
      const blocker = dgram.createSocket('udp4');
      await new Promise<void>((resolve, reject) => {
        blocker.once('error', reject);
        blocker.bind({ port: 0, address: '0.0.0.0' }, () => resolve());
      });

      const port = blocker.address().port;

      await expect(assertUdpPortAvailable(port, '0.0.0.0')).rejects.toMatchObject({
        code: ErrorCode.MCP_STARTUP_FAILURE,
        name: 'AppError'
      });

      await new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      });
    });
  });
});
