import { UDPPort } from 'osc';

export interface OscMessageArgument {
  type: string;
  value: unknown;
}

export interface OscMessage {
  address: string;
  args?: OscMessageArgument[];
}

export interface OscMessageSummary {
  address: string;
  args: OscMessageArgument[];
}

export type OscMessageListener = (message: OscMessage) => void;

export type OscLogger = Pick<Console, 'info' | 'debug' | 'error'>;

export interface OscLoggingState {
  incoming: boolean;
  outgoing: boolean;
}

export type OscLoggingOptions = Partial<OscLoggingState>;

export interface OscAddressDiagnostics {
  address: string;
  count: number;
  lastTimestamp: number | null;
}

export interface OscDirectionDiagnostics {
  count: number;
  bytes: number;
  lastTimestamp: number | null;
  lastMessage: OscMessageSummary | null;
  addresses: OscAddressDiagnostics[];
}

export interface OscDiagnostics {
  config: {
    localAddress: string;
    localPort: number;
    remoteAddress?: string;
    remotePort?: number;
  };
  logging: OscLoggingState;
  stats: {
    incoming: OscDirectionDiagnostics;
    outgoing: OscDirectionDiagnostics;
  };
  listeners: {
    active: number;
  };
  startedAt: number;
  uptimeMs: number;
}

export interface OscServiceConfig {
  localAddress?: string;
  localPort: number;
  remoteAddress?: string;
  remotePort?: number;
  logger?: OscLogger;
}

type Direction = 'incoming' | 'outgoing';

interface DirectionStats {
  count: number;
  bytes: number;
  lastTimestamp: number | null;
  lastMessage: OscMessageSummary | null;
  addresses: Map<string, { count: number; lastTimestamp: number | null }>;
}

export class OscService {
  private readonly port: UDPPort;

  private readonly logger: OscLogger;

  private readonly listeners = new Set<OscMessageListener>();

  private readonly loggingState: OscLoggingState = { incoming: false, outgoing: false };

  private readonly stats: Record<Direction, DirectionStats> = {
    incoming: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: new Map() },
    outgoing: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: new Map() }
  };

  private readonly startedAt = Date.now();

  constructor(private readonly config: OscServiceConfig) {
    this.logger = config.logger ?? console;

    this.port = new UDPPort({
      localAddress: config.localAddress ?? '0.0.0.0',
      localPort: config.localPort,
      remoteAddress: config.remoteAddress,
      remotePort: config.remotePort,
      metadata: true
    });

    this.port.on('ready', () => {
      this.logger.info(
        `OSC UDP port ouvert sur ${config.localAddress ?? '0.0.0.0'}:${config.localPort}`
      );
    });

    this.port.on('message', (rawMessage: unknown) => {
      const message = this.normaliseIncomingMessage(rawMessage);
      if (!message) {
        this.logger.error('[OSC] Message recu dans un format inattendu', rawMessage);
        return;
      }

      const summary = this.createMessageSummary(message);
      this.updateStats('incoming', summary);

      if (this.loggingState.incoming) {
        this.logger.debug(`[OSC] <- ${summary.address}`, summary.args);
      }

      this.listeners.forEach((listener) => {
        try {
          listener(message);
        } catch (error) {
          this.logger.error('[OSC] Erreur lors du traitement du message', error);
        }
      });
    });

    this.port.open();
  }

  public send(message: OscMessage, targetAddress?: string, targetPort?: number): void {
    const summary = this.createMessageSummary(message);
    this.updateStats('outgoing', summary);

    if (this.loggingState.outgoing) {
      this.logger.debug(`[OSC] -> ${summary.address}`, summary.args);
    }

    this.port.send(message, targetAddress ?? this.config.remoteAddress, targetPort ?? this.config.remotePort);
  }

  public onMessage(listener: OscMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setLoggingOptions(options: OscLoggingOptions): OscLoggingState {
    if (typeof options.incoming === 'boolean') {
      this.loggingState.incoming = options.incoming;
    }
    if (typeof options.outgoing === 'boolean') {
      this.loggingState.outgoing = options.outgoing;
    }

    this.logger.info(
      `[OSC] Logging mis a jour - entrant: ${this.loggingState.incoming ? 'active' : 'inactive'}, sortant: ${
        this.loggingState.outgoing ? 'active' : 'inactive'
      }`
    );

    return { ...this.loggingState };
  }

  public getDiagnostics(): OscDiagnostics {
    const now = Date.now();
    return {
      config: {
        localAddress: this.config.localAddress ?? '0.0.0.0',
        localPort: this.config.localPort,
        remoteAddress: this.config.remoteAddress,
        remotePort: this.config.remotePort
      },
      logging: { ...this.loggingState },
      stats: {
        incoming: this.serialiseDirectionStats(this.stats.incoming),
        outgoing: this.serialiseDirectionStats(this.stats.outgoing)
      },
      listeners: {
        active: this.listeners.size
      },
      startedAt: this.startedAt,
      uptimeMs: now - this.startedAt
    };
  }

  public close(): void {
    this.port.close();
    this.listeners.clear();
  }

  private createMessageSummary(message: OscMessage): OscMessageSummary {
    return {
      address: message.address,
      args: message.args ? [...message.args] : []
    };
  }

  private normaliseIncomingMessage(rawMessage: unknown): OscMessage | null {
    if (typeof rawMessage !== 'object' || rawMessage === null) {
      return null;
    }

    const candidate = rawMessage as Partial<OscMessage>;
    if (typeof candidate.address !== 'string') {
      return null;
    }

    const args = Array.isArray(candidate.args) ? (candidate.args as OscMessageArgument[]) : [];
    return { address: candidate.address, args };
  }

  private updateStats(direction: Direction, summary: OscMessageSummary): void {
    const stats = this.stats[direction];
    stats.count += 1;
    stats.lastTimestamp = Date.now();
    stats.lastMessage = summary;
    stats.bytes += this.estimateMessageSize(summary);

    const addressStats = stats.addresses.get(summary.address) ?? { count: 0, lastTimestamp: null };
    addressStats.count += 1;
    addressStats.lastTimestamp = stats.lastTimestamp;
    stats.addresses.set(summary.address, addressStats);
  }

  private estimateMessageSize(summary: OscMessageSummary): number {
    try {
      return Buffer.byteLength(JSON.stringify(summary), 'utf8');
    } catch (error) {
      this.logger.error('[OSC] Impossible de calculer la taille du message', error);
      return 0;
    }
  }

  private serialiseDirectionStats(stats: DirectionStats): OscDirectionDiagnostics {
    const addresses = Array.from(stats.addresses.entries())
      .map(([address, data]) => ({
        address,
        count: data.count,
        lastTimestamp: data.lastTimestamp
      }))
      .sort((a, b) => b.count - a.count || (b.lastTimestamp ?? 0) - (a.lastTimestamp ?? 0));

    return {
      count: stats.count,
      bytes: stats.bytes,
      lastTimestamp: stats.lastTimestamp,
      lastMessage: stats.lastMessage,
      addresses
    };
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
