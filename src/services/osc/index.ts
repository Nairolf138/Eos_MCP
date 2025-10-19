import { UDPPort } from 'osc';

export interface OscMessageArgument {
  type: string;
  value: unknown;
}

export interface OscMessage {
  address: string;
  args?: OscMessageArgument[];
}

export type OscMessageListener = (message: OscMessage) => void;

export interface OscServiceConfig {
  localAddress?: string;
  localPort: number;
  remoteAddress?: string;
  remotePort?: number;
}

export class OscService {
  private readonly port: UDPPort;

  private readonly listeners = new Set<OscMessageListener>();

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

    this.port.on('message', (message: OscMessage) => {
      console.debug('[OSC] message recu', message);
      this.listeners.forEach((listener) => {
        try {
          listener(message);
        } catch (error) {
          console.error('[OSC] Erreur lors du traitement du message', error);
        }
      });
    });

    this.port.open();
  }

  public send(message: OscMessage, targetAddress?: string, targetPort?: number): void {
    this.port.send(message, targetAddress ?? this.config.remoteAddress, targetPort ?? this.config.remotePort);
  }

  public onMessage(listener: OscMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public close(): void {
    this.port.close();
    this.listeners.clear();
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
