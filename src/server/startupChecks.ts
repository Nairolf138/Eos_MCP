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

function resolveSocketType(host: string): dgram.SocketType {
  const trimmed = host.trim();
  const withoutBrackets =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  const [addressPortion] = withoutBrackets.split('%');

  if (net.isIPv6(addressPortion)) {
    return 'udp6';
  }

  return 'udp4';
}

export async function assertUdpPortAvailable(port: number, host = '0.0.0.0'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const address = host ?? '0.0.0.0';
    const socketType = resolveSocketType(address);
    const socket = dgram.createSocket(socketType);

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
      socket.close(() => {
        cleanup();
        resolve();
      });
    });

    socket.bind({ port, address, exclusive: true });
  });
}
