import { UDPPort } from 'osc';

export interface OscServiceConfig {
  localAddress?: string;
  localPort: number;
  remoteAddress?: string;
  remotePort?: number;
}

export class OscService {
  private readonly port: UDPPort;

  constructor(private readonly config: OscServiceConfig) {
    this.port = new UDPPort({
      localAddress: config.localAddress ?? '0.0.0.0',
      localPort: config.localPort,
      remoteAddress: config.remoteAddress,
      remotePort: config.remotePort,
      metadata: true
    });

    this.port.on('ready', () => {
      console.info(`OSC UDP port ouvert sur ${config.localAddress ?? '0.0.0.0'}:${config.localPort}`);
    });

    this.port.on('message', (message) => {
      console.debug('[OSC] message recu', message);
    });

    this.port.open();
  }

  public send(message: unknown, targetAddress?: string, targetPort?: number): void {
    this.port.send(message, targetAddress ?? this.config.remoteAddress, targetPort ?? this.config.remotePort);
  }

  public close(): void {
    this.port.close();
  }
}

export function createOscServiceFromEnv(): OscService {
  const localPort = Number.parseInt(process.env.OSC_UDP_IN_PORT ?? '8000', 10);
  const remotePort = Number.parseInt(process.env.OSC_UDP_OUT_PORT ?? '8001', 10);
  const remoteAddress = process.env.OSC_REMOTE_ADDRESS ?? '127.0.0.1';

  return new OscService({
    localPort,
    remotePort,
    remoteAddress
  });
}
