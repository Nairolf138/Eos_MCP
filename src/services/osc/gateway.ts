import osc from 'osc';
import { createLogger } from '../../server/logger.js';
import type {
  OscDiagnostics,
  OscLoggingOptions,
  OscLoggingState,
  OscMessage,
  OscMessageArgument,
  OscMessageSummary
} from './index.js';
import {
  OscConnectionManager,
  type OscConnectionManagerOptions,
  type ToolTransportPreference,
  type TransportStatus
} from './connectionManager.js';
import type { OscGateway, OscGatewaySendOptions } from './client.js';

type Direction = 'incoming' | 'outgoing';

interface DirectionStats {
  count: number;
  bytes: number;
  lastTimestamp: number | null;
  lastMessage: OscMessageSummary | null;
  addresses: Map<string, { count: number; lastTimestamp: number | null }>;
}

export interface OscConnectionGatewayOptions extends OscConnectionManagerOptions {
  metadata?: boolean;
  localAddress?: string;
  localPort?: number;
}

type StatusListener = (status: TransportStatus) => void;

const DEFAULT_METADATA = true;

function normaliseToolId(candidate: string | undefined, message: OscMessage): string {
  if (candidate && candidate.trim().length > 0) {
    return candidate;
  }
  return message.address;
}

function cloneArgs(args: OscMessageArgument[] | undefined): OscMessageArgument[] {
  if (!Array.isArray(args)) {
    return [];
  }
  return args.map((arg) => ({ ...arg }));
}

export class OscConnectionGateway implements OscGateway {
  private manager: OscConnectionManager;

  private readonly logger = createLogger('osc-gateway');

  private readonly listeners = new Set<(message: OscMessage) => void>();

  private readonly statusListeners = new Set<StatusListener>();

  private readonly loggingState: OscLoggingState = { incoming: false, outgoing: false };

  private readonly stats: Record<Direction, DirectionStats> = {
    incoming: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: new Map() },
    outgoing: { count: 0, bytes: 0, lastTimestamp: null, lastMessage: null, addresses: new Map() }
  };

  private readonly startedAt = Date.now();

  private metadata: boolean;

  private readonly config: {
    host: string;
    tcpPort: number;
    udpPort: number;
    localAddress: string;
    localPort: number;
  };

  constructor(options: OscConnectionGatewayOptions) {
    this.metadata = options.metadata ?? DEFAULT_METADATA;
    this.config = {
      host: options.host,
      tcpPort: options.tcpPort,
      udpPort: options.udpPort,
      localAddress: options.localAddress ?? '0.0.0.0',
      localPort: options.localPort ?? 0
    };

    this.manager = this.createManager(options);
    this.attachManagerEvents(this.manager);
  }

  public async send(message: OscMessage, options: OscGatewaySendOptions = {}): Promise<void> {
    const toolId = normaliseToolId(options.toolId, message);
    const encoded = this.encodeMessage(message);

    if (options.transportPreference) {
      this.setToolPreference(toolId, options.transportPreference);
    }

    try {
      const transport = this.manager.send(toolId, encoded);
      this.updateStats('outgoing', message, encoded.byteLength);
      if (this.loggingState.outgoing) {
        this.logger.debug(`[OSC][${transport}] -> ${message.address}`, message.args ?? []);
      }
    } catch (error) {
      this.logger.error({ address: message.address }, "Erreur lors de l'envoi OSC", error);
      throw error;
    }
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
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
      `Logging mis a jour - entrant: ${this.loggingState.incoming ? 'active' : 'inactive'}, sortant: ${
        this.loggingState.outgoing ? 'active' : 'inactive'
      }`
    );

    return { ...this.loggingState };
  }

  public getDiagnostics(): OscDiagnostics {
    const now = Date.now();
    return {
      config: {
        localAddress: this.config.localAddress,
        localPort: this.config.localPort,
        remoteAddress: this.config.host,
        remotePort: this.config.udpPort
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

  public setToolPreference(toolId: string, preference: ToolTransportPreference): void {
    this.manager.setToolPreference(toolId, preference);
  }

  public getToolPreference(toolId: string): ToolTransportPreference {
    return this.manager.getToolPreference(toolId);
  }

  public removeTool(toolId: string): void {
    this.manager.removeTool(toolId);
  }

  public close(): void {
    this.detachManagerEvents(this.manager);
    this.manager.stop();
    this.listeners.clear();
    this.statusListeners.clear();
  }

  public reconfigure(options: OscConnectionGatewayOptions): void {
    this.close();
    this.config.host = options.host;
    this.config.tcpPort = options.tcpPort;
    this.config.udpPort = options.udpPort;
    this.config.localAddress = options.localAddress ?? this.config.localAddress;
    this.config.localPort = options.localPort ?? this.config.localPort;
    this.metadata = options.metadata ?? this.metadata;

    this.manager = this.createManager(options);
    this.attachManagerEvents(this.manager);
  }

  private createManager(options: OscConnectionGatewayOptions): OscConnectionManager {
    const { metadata: _metadata, localAddress: _localAddress, localPort: _localPort, ...rest } = options;
    return new OscConnectionManager(rest);
  }

  private attachManagerEvents(manager: OscConnectionManager): void {
    manager.on('message', ({ type, data }) => {
      const message = this.decodeMessage(data);
      if (!message) {
        this.logger.error('[OSC] Message recu dans un format inattendu');
        return;
      }

      this.updateStats('incoming', message, data.byteLength ?? data.length ?? 0);
      if (this.loggingState.incoming) {
        this.logger.debug(`[OSC][${type}] <- ${message.address}`, message.args ?? []);
      }

      this.listeners.forEach((listener) => {
        try {
          listener(message);
        } catch (error) {
          this.logger.error('[OSC] Erreur lors du traitement du message', error);
        }
      });
    });

    manager.on('status', (status) => {
      this.statusListeners.forEach((listener) => {
        try {
          listener(status);
        } catch (error) {
          this.logger.error('[OSC] Erreur lors de la notification de statut', error);
        }
      });
    });
  }

  private detachManagerEvents(manager: OscConnectionManager): void {
    manager.removeAllListeners('message');
    manager.removeAllListeners('status');
  }

  private encodeMessage(message: OscMessage): Buffer {
    const packet = {
      address: message.address,
      args: cloneArgs(message.args)
    };

    const encoded = osc.writePacket(packet, { metadata: this.metadata }) as Uint8Array;
    return Buffer.from(encoded);
  }

  private decodeMessage(data: Buffer): OscMessage | null {
    let packet: unknown;
    try {
      packet = osc.readPacket(data, { metadata: this.metadata });
    } catch (error) {
      this.logger.error('[OSC] Impossible de decoder le paquet OSC', error);
      return null;
    }

    if (!packet || typeof packet !== 'object') {
      return null;
    }

    const message = packet as Partial<OscMessage> & { packets?: unknown[]; type?: string };
    if (typeof message.address !== 'string') {
      if (Array.isArray(message.packets) && message.packets.length > 0) {
        const first = message.packets[0] as Partial<OscMessage>;
        if (first && typeof first.address === 'string') {
          return {
            address: first.address,
            args: cloneArgs(first.args ?? [])
          };
        }
      }
      return null;
    }

    return {
      address: message.address,
      args: cloneArgs(message.args ?? [])
    };
  }

  private updateStats(direction: Direction, message: OscMessage, bytes: number): void {
    const stats = this.stats[direction];
    stats.count += 1;
    stats.lastTimestamp = Date.now();
    stats.lastMessage = this.createMessageSummary(message);
    stats.bytes += bytes;

    const addressStats = stats.addresses.get(message.address) ?? { count: 0, lastTimestamp: null };
    addressStats.count += 1;
    addressStats.lastTimestamp = stats.lastTimestamp;
    stats.addresses.set(message.address, addressStats);
  }

  private createMessageSummary(message: OscMessage): OscMessageSummary {
    return {
      address: message.address,
      args: cloneArgs(message.args)
    };
  }

  private serialiseDirectionStats(stats: DirectionStats) {
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

export function createOscConnectionGateway(options: OscConnectionGatewayOptions): OscConnectionGateway {
  return new OscConnectionGateway(options);
}

function parsePort(value: string | undefined, fallback: number, label: string): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`La valeur du port ${label} est invalide: ${value}`);
  }
  return parsed;
}

export function createOscGatewayFromEnv(
  options: Partial<
    Pick<
      OscConnectionManagerOptions,
      'logger' | 'heartbeatIntervalMs' | 'reconnectDelayMs' | 'connectionTimeoutMs'
    >
  > = {}
): OscConnectionGateway {
  const host = process.env.OSC_REMOTE_ADDRESS ?? '127.0.0.1';
  const tcpPort = parsePort(process.env.OSC_TCP_PORT, 3032, 'OSC_TCP_PORT');
  const udpPort = parsePort(process.env.OSC_UDP_OUT_PORT, 8001, 'OSC_UDP_OUT_PORT');
  const localPort = parsePort(process.env.OSC_UDP_IN_PORT, 8000, 'OSC_UDP_IN_PORT');

  return createOscConnectionGateway({
    host,
    tcpPort,
    udpPort,
    localPort,
    logger: options.logger,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    reconnectDelayMs: options.reconnectDelayMs,
    connectionTimeoutMs: options.connectionTimeoutMs
  });
}
