import osc from 'osc';
import { getConfig, type OscConfig as ResolvedOscConfig } from '../../config/index';
import { createLogger } from '../../server/logger';
import type {
  OscDiagnostics,
  OscLoggingOptions,
  OscLoggingState,
  OscMessage,
  OscMessageArgument,
  OscMessageSummary
} from './index';
import {
  OscConnectionManager,
  type OscConnectionManagerOptions,
  type ToolTransportPreference,
  type TransportStatus,
  type TransportType
} from './connectionManager';
import { OscConnectionStateProvider } from './connectionState';
import type { OscGateway, OscGatewaySendOptions } from './client';

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
  connectionStateProvider?: OscConnectionStateProvider;
}

type StatusListener = (status: TransportStatus) => void;

const DEFAULT_METADATA = true;
const DEFAULT_HEARTBEAT_REPLY_ADDRESS = '/eos/ping/reply';

type OscGatewayFactoryOptions = Partial<
  Pick<
    OscConnectionGatewayOptions,
    | 'logger'
    | 'heartbeatIntervalMs'
    | 'reconnectDelayMs'
    | 'reconnectBackoff'
    | 'reconnectTimeoutMs'
    | 'connectionTimeoutMs'
    | 'connectionStateProvider'
    | 'heartbeatPayload'
    | 'heartbeatResponseMatcher'
  >
>;

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

function hasAddressInOscPacket(packet: unknown, expectedAddress: string): boolean {
  if (!packet || typeof packet !== 'object') {
    return false;
  }

  const candidate = packet as { address?: unknown; packets?: unknown[] };
  if (candidate.address === expectedAddress) {
    return true;
  }

  if (!Array.isArray(candidate.packets)) {
    return false;
  }

  return candidate.packets.some((nestedPacket) => hasAddressInOscPacket(nestedPacket, expectedAddress));
}

function createHeartbeatResponseMatcher(metadata: boolean): (data: Buffer) => boolean {
  return (data: Buffer): boolean => {
    try {
      const packet = osc.readPacket(data, { metadata });
      return hasAddressInOscPacket(packet, DEFAULT_HEARTBEAT_REPLY_ADDRESS);
    } catch {
      return false;
    }
  };
}

export class OscConnectionGateway implements OscGateway {
  private manager: OscConnectionManager;

  private readonly logger = createLogger('osc-gateway');

  private readonly listeners = new Set<(message: OscMessage) => void>();

  private readonly statusListeners = new Set<StatusListener>();

  private readonly loggingState: OscLoggingState = { incoming: false, outgoing: false };

  private stats: Record<Direction, DirectionStats> = this.createInitialStats();

  private startedAt = Date.now();

  private metadata: boolean;

  private readonly connectionStateProvider?: OscConnectionStateProvider;

  private readonly transportReadyTimeoutMs: number;

  private readonly config: {
    host: string;
    tcpPort: number;
    udpPort: number;
    localAddress: string;
    localPort: number;
  };

  constructor(options: OscConnectionGatewayOptions) {
    this.metadata = options.metadata ?? DEFAULT_METADATA;
    this.connectionStateProvider = options.connectionStateProvider;
    this.transportReadyTimeoutMs = this.resolveTransportReadyTimeout(options);
    this.config = {
      host: options.host,
      tcpPort: options.tcpPort,
      udpPort: options.udpPort,
      localAddress: options.localAddress ?? '0.0.0.0',
      localPort: options.localPort ?? 0
    };

    this.resetRuntimeState();
    this.manager = this.createManager(options);
    this.attachManagerEvents(this.manager);
  }

  public async send(message: OscMessage, options: OscGatewaySendOptions = {}): Promise<void> {
    const toolId = normaliseToolId(options.toolId, message);
    const encoded = this.encodeMessage(message);
    const overrides =
      options.targetAddress !== undefined || options.targetPort !== undefined
        ? { targetAddress: options.targetAddress, targetPort: options.targetPort }
        : undefined;

    if (options.transportPreference) {
      this.setToolPreference(toolId, options.transportPreference);
    }

    const attemptSend = (): void => {
      const transport = this.manager.send(toolId, encoded, undefined, overrides);
      this.updateStats('outgoing', message, encoded.byteLength);
      if (this.loggingState.outgoing) {
        this.logger.debug(
          { args: message.args ?? [], correlationId: options.correlationId },
          `[OSC][${transport}] -> ${message.address}`
        );
      }
    };

    try {
      attemptSend();
      return;
    } catch (error) {
      if (this.shouldWaitForTransport(error)) {
        try {
          await this.waitForTransportReady(message.address);
        } catch (waitError) {
          this.logSendError(
            waitError,
            message,
            "Delai depasse en attendant un transport OSC pret",
            options.correlationId
          );
          throw waitError instanceof Error ? waitError : new Error(String(waitError));
        }

        try {
          attemptSend();
          return;
        } catch (retryError) {
          this.logSendError(retryError, message, "Erreur lors de l'envoi OSC", options.correlationId);
          throw retryError instanceof Error
            ? retryError
            : new Error(String(retryError));
        }
      }

      this.logSendError(error, message, "Erreur lors de l'envoi OSC", options.correlationId);
      throw error instanceof Error ? error : new Error(String(error));
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

  public getConnectionStateProvider(): OscConnectionStateProvider | undefined {
    return this.connectionStateProvider;
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

  public close(options: { preserveListeners?: boolean } = {}): void {
    this.detachManagerEvents(this.manager);
    this.manager.stop();
    if (this.connectionStateProvider) {
      this.connectionStateProvider.setStatus(this.manager.getStatus('tcp'));
      this.connectionStateProvider.setStatus(this.manager.getStatus('udp'));
    }
    if (!options.preserveListeners) {
      this.listeners.clear();
      this.statusListeners.clear();
    }
  }

  public reconfigure(options: OscConnectionGatewayOptions): void {
    this.close({ preserveListeners: true });
    this.config.host = options.host;
    this.config.tcpPort = options.tcpPort;
    this.config.udpPort = options.udpPort;
    this.config.localAddress = options.localAddress ?? this.config.localAddress;
    this.config.localPort = options.localPort ?? this.config.localPort;
    this.metadata = options.metadata ?? this.metadata;

    this.manager = this.createManager(options);
    this.resetRuntimeState();
    this.attachManagerEvents(this.manager);
  }

  private createManager(options: OscConnectionGatewayOptions): OscConnectionManager {
    const {
      metadata: _metadata,
      connectionStateProvider: _provider,
      heartbeatResponseMatcher,
      ...rest
    } = options;

    return new OscConnectionManager({
      ...rest,
      heartbeatResponseMatcher:
        heartbeatResponseMatcher ?? createHeartbeatResponseMatcher(this.metadata)
    });
  }

  private attachManagerEvents(manager: OscConnectionManager): void {
    if (this.connectionStateProvider) {
      this.connectionStateProvider.setStatus(manager.getStatus('tcp'));
      this.connectionStateProvider.setStatus(manager.getStatus('udp'));
    }

    manager.on('message', ({ type, data }) => {
      const messages = this.decodeMessages(data);
      if (messages.length === 0) {
        this.logger.error(
          { type, data },
          "[OSC] Message recu dans un format inattendu"
        );
        return;
      }

      const totalBytes =
        typeof data?.byteLength === 'number'
          ? data.byteLength
          : typeof data?.length === 'number'
            ? data.length
            : 0;

      messages.forEach((message, index) => {
        this.updateStats('incoming', message, index === 0 ? totalBytes : 0);
        if (this.loggingState.incoming) {
          this.logger.debug(
            { args: message.args ?? [] },
            `[OSC][${type}] <- ${message.address}`
          );
        }

        this.notifyListeners(message);
      });
    });

    manager.on('status', (status) => {
      this.connectionStateProvider?.setStatus(status);
      this.statusListeners.forEach((listener) => {
        try {
          listener(status);
        } catch (error) {
          const errorData =
            error instanceof Error ? { err: error } : { error };
          this.logger.error(
            errorData,
            "[OSC] Erreur lors de la notification de statut"
          );
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

  private decodeMessages(data: Buffer): OscMessage[] {
    let packet: unknown;
    try {
      packet = osc.readPacket(data, { metadata: this.metadata });
    } catch (error) {
      const errorData = error instanceof Error ? { err: error } : { error };
      this.logger.error(
        errorData,
        '[OSC] Impossible de decoder le paquet OSC'
      );
      return [];
    }

    if (!packet || typeof packet !== 'object') {
      return [];
    }

    return this.extractMessagesFromPacket(packet);
  }

  private extractMessagesFromPacket(packet: unknown): OscMessage[] {
    if (!packet || typeof packet !== 'object') {
      return [];
    }

    const message = packet as Partial<OscMessage> & { packets?: unknown[]; type?: string };

    if (typeof message.address === 'string') {
      return [
        {
          address: message.address,
          args: cloneArgs(message.args ?? [])
        }
      ];
    }

    if (Array.isArray(message.packets)) {
      return message.packets.flatMap((child) => this.extractMessagesFromPacket(child));
    }

    return [];
  }

  private notifyListeners(message: OscMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        const errorData = error instanceof Error ? { err: error } : { error };
        this.logger.error(
          errorData,
          '[OSC] Erreur lors du traitement du message'
        );
      }
    });
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

  private createInitialStats(): Record<Direction, DirectionStats> {
    return {
      incoming: this.createEmptyDirectionStats(),
      outgoing: this.createEmptyDirectionStats()
    };
  }

  private createEmptyDirectionStats(): DirectionStats {
    return {
      count: 0,
      bytes: 0,
      lastTimestamp: null,
      lastMessage: null,
      addresses: new Map()
    };
  }

  private resetRuntimeState(): void {
    this.stats = this.createInitialStats();
    this.startedAt = Date.now();
  }

  private resolveTransportReadyTimeout(options: OscConnectionGatewayOptions): number {
    const DEFAULT_CONNECTION_TIMEOUT_MS = 3_000;
    const connectionTimeout = Math.max(0, options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS);
    const reconnectTimeout =
      typeof options.reconnectTimeoutMs === 'number' && options.reconnectTimeoutMs > 0
        ? options.reconnectTimeoutMs
        : 0;
    return reconnectTimeout > 0 ? Math.max(connectionTimeout, reconnectTimeout) : connectionTimeout;
  }

  private getTransportStatuses(): TransportStatus[] {
    const transportTypes: TransportType[] = ['tcp', 'udp'];
    return transportTypes.map((type) => this.manager.getStatus(type));
  }

  private hasConnectingTransport(): boolean {
    return this.getTransportStatuses().some((status) => status.state === 'connecting');
  }

  private hasConnectedTransport(): boolean {
    return this.getTransportStatuses().some((status) => status.state === 'connected');
  }

  private isTransportUnavailableError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      error.message.includes(
        "Aucun transport OSC disponible pour l'outil. Les connexions TCP et UDP sont indisponibles."
      )
    );
  }

  private shouldWaitForTransport(error: unknown): boolean {
    return this.isTransportUnavailableError(error) && this.hasConnectingTransport();
  }

  private waitForTransportReady(address: string): Promise<void> {
    if (this.hasConnectedTransport()) {
      return Promise.resolve();
    }

    const timeoutMs = this.transportReadyTimeoutMs;
    if (timeoutMs <= 0) {
      return Promise.reject(this.createTransportReadyTimeoutError(address, timeoutMs));
    }

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      const cleanup = (): void => {
        this.manager.off('status', onStatus);
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const onStatus = (status: TransportStatus): void => {
        if (status.state === 'connected') {
          cleanup();
          resolve();
        }
      };

      this.manager.on('status', onStatus);

      if (this.hasConnectedTransport()) {
        cleanup();
        resolve();
        return;
      }

      timer = setTimeout(() => {
        cleanup();
        reject(this.createTransportReadyTimeoutError(address, timeoutMs));
      }, timeoutMs);
      timer.unref?.();
    });
  }

  private createTransportReadyTimeoutError(address: string, timeoutMs: number): Error {
    return new Error(
      `Impossible d'envoyer le message OSC ${address} : aucun transport pret apres ${timeoutMs} ms.`
    );
  }

  private logSendError(
    error: unknown,
    message: OscMessage,
    logMessage = "Erreur lors de l'envoi OSC",
    correlationId?: string
  ): void {
    const errorData =
      error instanceof Error
        ? { err: error, address: message.address, correlationId }
        : { error, address: message.address, correlationId };
    this.logger.error(errorData, logMessage);
  }
}

export function createOscConnectionGateway(options: OscConnectionGatewayOptions): OscConnectionGateway {
  return new OscConnectionGateway(options);
}

export function createOscGatewayFromConfig(
  oscConfig: ResolvedOscConfig,
  options: OscGatewayFactoryOptions = {}
): OscConnectionGateway {
  return createOscConnectionGateway({
    host: oscConfig.remoteAddress,
    tcpPort: oscConfig.tcpPort,
    udpPort: oscConfig.udpOutPort,
    localPort: oscConfig.udpInPort,
    localAddress: oscConfig.localAddress,
    tcpNoDelay: oscConfig.tcpNoDelay,
    tcpKeepAliveMs: oscConfig.tcpKeepAliveMs,
    udpRecvBufferSize: oscConfig.udpRecvBufferSize,
    udpSendBufferSize: oscConfig.udpSendBufferSize,
    logger: options.logger,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
    reconnectDelayMs: options.reconnectDelayMs,
    reconnectBackoff: options.reconnectBackoff,
    reconnectTimeoutMs: options.reconnectTimeoutMs,
    connectionTimeoutMs: options.connectionTimeoutMs,
    connectionStateProvider: options.connectionStateProvider
  });
}

export function createOscGatewayFromEnv(
  options: OscGatewayFactoryOptions = {}
): OscConnectionGateway {
  return createOscGatewayFromConfig(getConfig().osc, options);
}
