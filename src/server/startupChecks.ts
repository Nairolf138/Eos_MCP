import net from 'node:net';
import dgram from 'node:dgram';
import { AppError, ErrorCode } from './errors';

function createPortInUseError(port: number, protocol: 'TCP' | 'UDP', cause?: unknown): AppError {
  return new AppError(ErrorCode.MCP_STARTUP_FAILURE, `Le port ${protocol} ${port} est deja utilise.`, {
    cause,
    details: { port, protocol }
  });
}

export async function assertTcpPortAvailable(port: number, host = '0.0.0.0'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();

    const cleanup = () => {
      server.removeAllListeners('error');
      server.removeAllListeners('listening');
    };

    server.once('error', (error) => {
      cleanup();
      server.close();
      reject(createPortInUseError(port, 'TCP', error));
    });

    server.once('listening', () => {
      cleanup();
      server.close((error) => {
        if (error) {
          reject(createPortInUseError(port, 'TCP', error));
        } else {
          resolve();
        }
      });
    });

    server.listen({ port, host, exclusive: true });
  });
}

export async function assertUdpPortAvailable(port: number, host = '0.0.0.0'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket('udp4');

    const cleanup = () => {
      socket.removeAllListeners('error');
      socket.removeAllListeners('listening');
      socket.removeAllListeners('close');
    };

    socket.once('error', (error) => {
      cleanup();
      socket.close();
      reject(createPortInUseError(port, 'UDP', error));
    });

    socket.once('listening', () => {
      socket.once('close', () => {
        cleanup();
        resolve();
      });

      socket.close();
    });

    socket.bind({ port, address: host, exclusive: true });
  });
}
