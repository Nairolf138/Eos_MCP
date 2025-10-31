import { EventEmitter } from 'node:events';
import { Socket as TcpSocket, createConnection as createTcpConnection } from 'node:net';
import { Socket as UdpSocket, createSocket as createUdpSocket } from 'node:dgram';
import type { BindOptions } from 'node:dgram';

export type TransportType = 'tcp' | 'udp';

export type TransportState = 'disconnected' | 'connecting' | 'connected';

export type ToolTransportPreference = 'reliability' | 'speed' | 'auto';

export interface OscConnectionLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface OscConnectionManagerOptions {
  host: string;
  tcpPort: number;
  udpPort: number;
  localAddress?: string;
  localPort?: number;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  reconnectBackoff?: OscReconnectBackoffOptions;
  reconnectTimeoutMs?: number;
  connectionTimeoutMs?: number;
  heartbeatPayload?: Buffer | string | Uint8Array;
  heartbeatResponseMatcher?: (data: Buffer) => boolean;
  logger?: OscConnectionLogger;
  createTcpSocket?: () => TcpSocket;
  createUdpSocket?: () => UdpSocket;
}

export interface OscReconnectBackoffOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitter?: number;
}

export interface TransportStatus {
  type: TransportType;
  state: TransportState;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  consecutiveFailures: number;
}

interface TransportInternals {
  readonly type: TransportType;
  state: TransportState;
  socket: TcpSocket | UdpSocket | null;
  targetHost: string | null;
  targetPort: number | null;
  buffer: Buffer;
  heartbeatTimer: NodeJS.Timeout | null;
  heartbeatTimeoutTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  consecutiveFailures: number;
  reconnectStartedAt: number | null;
}

type OscConnectionEvents = {
  status: [TransportStatus];
  message: [{ type: TransportType; data: Buffer }];
};

const noop = (): void => {};

function createNoopLogger(): Required<OscConnectionLogger> {
  return { debug: noop, info: noop, warn: noop, error: noop };
}

export class OscConnectionManager extends EventEmitter {
  private readonly logger: Required<OscConnectionLogger>;

  private readonly heartbeatIntervalMs: number;

  private readonly reconnectBackoff: Required<OscReconnectBackoffOptions>;

  private readonly reconnectTimeoutMs: number | null;

  private readonly connectionTimeoutMs: number;

  private readonly heartbeatPayload: Buffer;

  private readonly heartbeatMatcher: (data: Buffer) => boolean;

  private readonly hasCustomMatcher: boolean;

  private readonly transports: Record<TransportType, TransportInternals> = {
    tcp: this.createInitialTransportState('tcp'),
    udp: this.createInitialTransportState('udp')
  };

  private readonly toolPreferences = new Map<string, ToolTransportPreference>();

  private readonly createTcpSocket: () => TcpSocket;

  private readonly createUdpSocket: () => UdpSocket;

  private running = true;

  constructor(private readonly options: OscConnectionManagerOptions) {
    super();

    this.logger = {
      ...createNoopLogger(),
      ...options.logger
    };

    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    const backoff = options.reconnectBackoff ?? {};
    const initialDelay = backoff.initialDelayMs ?? options.reconnectDelayMs ?? 1_000;
    const maxDelay = backoff.maxDelayMs ?? Math.max(initialDelay * 8, initialDelay);
    const multiplier = backoff.multiplier ?? 2;
    const jitter = backoff.jitter ?? 0;
    this.reconnectBackoff = {
      initialDelayMs: Math.max(0, initialDelay),
      maxDelayMs: Math.max(0, maxDelay),
      multiplier: Math.max(1, multiplier),
      jitter: Math.max(0, Math.min(1, jitter))
    };
    this.reconnectTimeoutMs =
      typeof options.reconnectTimeoutMs === 'number' && options.reconnectTimeoutMs >= 0
        ? options.reconnectTimeoutMs
        : null;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 3_000;
    this.heartbeatPayload = this.normalisePayload(options.heartbeatPayload ?? 'ping');
    this.hasCustomMatcher = typeof options.heartbeatResponseMatcher === 'function';
    this.heartbeatMatcher = options.heartbeatResponseMatcher ?? (() => true);

    this.createTcpSocket = options.createTcpSocket
      ? options.createTcpSocket
      : () => createTcpConnection({ host: options.host, port: options.tcpPort });
    this.createUdpSocket = options.createUdpSocket
      ? options.createUdpSocket
      : () => createUdpSocket('udp4');

    this.connectTransport('tcp');
    this.connectTransport('udp');
  }

  public override on<Event extends keyof OscConnectionEvents>(
    event: Event,
    listener: (...args: OscConnectionEvents[Event]) => void
  ): this {
    return super.on(event, listener);
  }

  public override once<Event extends keyof OscConnectionEvents>(
    event: Event,
    listener: (...args: OscConnectionEvents[Event]) => void
  ): this {
    return super.once(event, listener);
  }

  public override off<Event extends keyof OscConnectionEvents>(
    event: Event,
    listener: (...args: OscConnectionEvents[Event]) => void
  ): this {
    return super.off(event, listener);
  }

  public stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    (Object.values(this.transports) as TransportInternals[]).forEach((state) => {
      this.clearTimers(state);
      this.destroySocket(state);
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      state.state = 'disconnected';
      state.reconnectStartedAt = null;
    });
  }

  public setToolPreference(toolId: string, preference: ToolTransportPreference): void {
    this.toolPreferences.set(toolId, preference);
  }

  public getToolPreference(toolId: string): ToolTransportPreference {
    return this.toolPreferences.get(toolId) ?? 'auto';
  }

  public removeTool(toolId: string): void {
    this.toolPreferences.delete(toolId);
  }

  public getStatus(type: TransportType): TransportStatus {
    const state = this.transports[type];
    return {
      type,
      state: state.state,
      lastHeartbeatSentAt: state.lastHeartbeatSentAt,
      lastHeartbeatAckAt: state.lastHeartbeatAckAt,
      consecutiveFailures: state.consecutiveFailures
    };
  }

  public getActiveTransport(toolId: string): TransportType | null {
    const state = this.pickTransport(toolId);
    return state?.type ?? null;
  }

  public send(
    toolId: string,
    payload: Buffer | string | Uint8Array,
    encoding?: BufferEncoding,
    overrides?: { targetAddress?: string; targetPort?: number }
  ): TransportType {
    const state = this.pickTransport(toolId);
    if (!state) {
      throw new Error(
        "Aucun transport OSC disponible pour l'outil. Les connexions TCP et UDP sont indisponibles."
      );
    }

    const buffer = this.normalisePayload(payload, encoding);
    this.sendThroughState(state, buffer, overrides);
    return state.type;
  }

  private createInitialTransportState(type: TransportType): TransportInternals {
    return {
      type,
      state: 'disconnected',
      socket: null,
      targetHost: null,
      targetPort: null,
      buffer: Buffer.alloc(0),
      heartbeatTimer: null,
      heartbeatTimeoutTimer: null,
      reconnectTimer: null,
      lastHeartbeatSentAt: null,
      lastHeartbeatAckAt: null,
      consecutiveFailures: 0,
      reconnectStartedAt: null
    };
  }

  private connectTransport(type: TransportType): void {
    if (!this.running) {
      return;
    }

    const state = this.transports[type];
    if (state.state === 'connecting' || state.state === 'connected') {
      return;
    }

    this.logger.debug?.(`[OSC][${type}] Demarrage de la connexion`);

    state.state = 'connecting';
    this.emit('status', this.getStatus(type));

    this.clearTimers(state);
    this.destroySocket(state);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    try {
      if (type === 'tcp') {
        this.initialiseTcpTransport(state);
      } else {
        this.initialiseUdpTransport(state);
      }
    } catch (error) {
      this.logger.error?.(`[OSC][${type}] Erreur lors de l'initialisation`, error);
      this.handleTransportFailure(state, error instanceof Error ? error : undefined);
    }
  }

  private initialiseTcpTransport(state: TransportInternals): void {
    const socket = this.createTcpSocket();
    state.socket = socket;
    state.buffer = Buffer.alloc(0);

    const onConnect = (): void => {
      this.logger.info?.(
        `[OSC][tcp] Connecte a ${this.options.host}:${this.options.tcpPort}`
      );
      this.onTransportConnected(state);
    };

    const onData = (chunk: Buffer): void => {
      const existing = state.buffer;
      state.buffer = existing.length ? Buffer.concat([existing, chunk]) : Buffer.from(chunk);

      let buffer = state.buffer;

      while (buffer.length >= 4) {
        const packetLength = buffer.readUInt32BE(0);
        if (buffer.length < 4 + packetLength) {
          break;
        }

        const packet = buffer.subarray(4, 4 + packetLength);
        this.markHeartbeatAck(state, packet);
        this.emit('message', { type: 'tcp', data: packet });

        buffer = buffer.subarray(4 + packetLength);
      }

      state.buffer = buffer.length ? Buffer.from(buffer) : Buffer.alloc(0);
    };

    const onError = (error: Error): void => {
      this.logger.error?.('[OSC][tcp] Erreur de connexion', error);
      this.handleTransportFailure(state, error);
    };

    const onClose = (): void => {
      this.logger.warn?.('[OSC][tcp] Connexion fermee');
      this.handleTransportFailure(state);
    };

    const onTimeout = (): void => {
      this.logger.warn?.('[OSC][tcp] Timeout de connexion');
      this.handleTransportFailure(state, new Error('TCP timeout'));
    };

    socket.once('connect', onConnect);
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
    socket.on('timeout', onTimeout);
    if (typeof socket.setKeepAlive === 'function') {
      socket.setKeepAlive(true);
    }
    if (typeof socket.setTimeout === 'function') {
      socket.setTimeout(this.connectionTimeoutMs);
    }
  }

  private initialiseUdpTransport(state: TransportInternals): void {
    const socket = this.createUdpSocket();
    state.socket = socket;

    const onMessage = (message: Buffer): void => {
      this.markHeartbeatAck(state, message);
      this.emit('message', { type: 'udp', data: message });
    };

    const onError = (error: Error): void => {
      this.logger.error?.('[OSC][udp] Erreur de connexion', error);
      this.handleTransportFailure(state, error);
    };

    const onClose = (): void => {
      this.logger.warn?.('[OSC][udp] Connexion fermee');
      this.handleTransportFailure(state);
    };

    socket.on('message', onMessage);
    socket.on('error', onError);
    socket.on('close', onClose);

    const markConnected = (): void => {
      if (state.state !== 'connecting' || state.socket !== socket) {
        return;
      }
      state.targetHost = this.options.host;
      state.targetPort = this.options.udpPort;
      this.logger.info?.(
        `[OSC][udp] Connecte a ${this.options.host}:${this.options.udpPort}`
      );
      this.onTransportConnected(state);
    };

    const shouldBind =
      this.options.localAddress !== undefined || this.options.localPort !== undefined;

    if (shouldBind) {
      const bindOptions: BindOptions = {};
      if (this.options.localAddress !== undefined) {
        bindOptions.address = this.options.localAddress;
      }
      if (this.options.localPort !== undefined) {
        bindOptions.port = this.options.localPort;
      }

      socket.bind(bindOptions, markConnected);
    } else {
      markConnected();
    }
  }

  private onTransportConnected(state: TransportInternals): void {
    state.state = 'connected';
    state.consecutiveFailures = 0;
    state.lastHeartbeatAckAt = Date.now();
    state.lastHeartbeatSentAt = null;
    state.reconnectStartedAt = null;

    this.logger.debug?.(`[OSC][${state.type}] Connecte`);
    this.emit('status', this.getStatus(state.type));

    this.startHeartbeat(state);
  }

  private startHeartbeat(state: TransportInternals): void {
    if (!this.running) {
      return;
    }

    this.clearHeartbeat(state);

    const sendHeartbeat = (): void => {
      if (!this.running || state.state !== 'connected') {
        return;
      }

      state.lastHeartbeatSentAt = Date.now();
      try {
        this.sendThroughState(state, this.heartbeatPayload);
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error?.(
            `[OSC][${state.type}] Impossible d'envoyer le heartbeat`,
            error
          );
          this.handleTransportFailure(state, error);
        }
        return;
      }

      if (state.heartbeatTimeoutTimer) {
        clearTimeout(state.heartbeatTimeoutTimer);
      }

      state.heartbeatTimeoutTimer = setTimeout(() => {
        const lastAck = state.lastHeartbeatAckAt ?? 0;
        const elapsed = Date.now() - lastAck;
        if (elapsed >= this.connectionTimeoutMs) {
          this.logger.warn?.(
            `[OSC][${state.type}] Heartbeat expire (${elapsed}ms), tentative de reconnexion`
          );
          this.handleTransportFailure(state, new Error('Heartbeat timeout'));
        }
      }, this.connectionTimeoutMs);
    };

    // Envoi immediat du premier heartbeat
    sendHeartbeat();

    state.heartbeatTimer = setInterval(sendHeartbeat, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(state: TransportInternals): void {
    if (state.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;
    }
    if (state.heartbeatTimeoutTimer) {
      clearTimeout(state.heartbeatTimeoutTimer);
      state.heartbeatTimeoutTimer = null;
    }
  }

  private clearTimers(state: TransportInternals): void {
    this.clearHeartbeat(state);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  private destroySocket(state: TransportInternals): void {
    if (!state.socket) {
      return;
    }

    const socket = state.socket;
    state.socket = null;
    state.targetHost = null;
    state.targetPort = null;
    state.buffer = Buffer.alloc(0);

    if (state.type === 'tcp') {
      const tcpSocket = socket as TcpSocket;
      tcpSocket.removeAllListeners();
      if (typeof tcpSocket.destroy === 'function') {
        tcpSocket.destroy();
      }
    } else {
      const udpSocket = socket as UdpSocket;
      udpSocket.removeAllListeners();
      try {
        udpSocket.close();
      } catch (error) {
        this.logger.error?.('[OSC][udp] Erreur lors de la fermeture du socket', error);
      }
    }
  }

  private handleTransportFailure(state: TransportInternals, error?: Error): void {
    if (!this.running) {
      return;
    }

    if (error) {
      this.logger.error?.(`[OSC][${state.type}] Echec de la connexion`, error);
    }

    this.clearTimers(state);
    this.destroySocket(state);

    if (state.reconnectStartedAt === null) {
      state.reconnectStartedAt = Date.now();
    }

    if (state.state !== 'disconnected') {
      state.state = 'disconnected';
      state.consecutiveFailures += 1;
      this.emit('status', this.getStatus(state.type));
    }

    if (this.running) {
      this.scheduleReconnect(state);
    }
  }

  private computeReconnectDelay(consecutiveFailures: number): number {
    const attemptIndex = Math.max(0, consecutiveFailures - 1);
    const { initialDelayMs, multiplier, maxDelayMs, jitter } = this.reconnectBackoff;

    const exponentialDelay = initialDelayMs * Math.pow(multiplier, attemptIndex);
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    if (jitter <= 0) {
      return Math.round(cappedDelay);
    }

    const jitterRange = cappedDelay * jitter;
    const jitterOffset = Math.random() * jitterRange;
    return Math.round(Math.min(maxDelayMs, cappedDelay + jitterOffset));
  }

  private scheduleReconnect(state: TransportInternals): void {
    if (state.reconnectTimer || !this.running) {
      return;
    }

    if (state.reconnectStartedAt === null) {
      state.reconnectStartedAt = Date.now();
    }

    const delay = this.computeReconnectDelay(state.consecutiveFailures || 1);

    if (this.reconnectTimeoutMs !== null) {
      const now = Date.now();
      const elapsed = now - state.reconnectStartedAt;
      if (elapsed >= this.reconnectTimeoutMs || elapsed + delay > this.reconnectTimeoutMs) {
        this.logger.warn?.(
          `[OSC][${state.type}] Delai de reconnexion depasse (${this.reconnectTimeoutMs}ms), abandon de la tentative`
        );
        return;
      }
    }

    this.logger.debug?.(
      `[OSC][${state.type}] Nouvelle tentative de connexion dans ${delay}ms`
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connectTransport(state.type);
    }, delay);
  }

  private markHeartbeatAck(state: TransportInternals, data?: Buffer): void {
    if (data && this.hasCustomMatcher && !this.heartbeatMatcher(data)) {
      return;
    }
    state.lastHeartbeatAckAt = Date.now();
    if (state.heartbeatTimeoutTimer) {
      clearTimeout(state.heartbeatTimeoutTimer);
      state.heartbeatTimeoutTimer = null;
    }
  }

  private pickTransport(toolId: string): TransportInternals | null {
    const preference = this.getToolPreference(toolId);

    const order: TransportType[] = this.getTransportPriority(preference);

    for (const type of order) {
      const candidate = this.transports[type];
      if (candidate.state === 'connected') {
        return candidate;
      }
    }

    // Aucun transport n'est actif : on force la reconnexion sur les candidats
    order.forEach((type) => this.connectTransport(type));
    return null;
  }

  private getTransportPriority(preference: ToolTransportPreference): TransportType[] {
    if (preference === 'reliability') {
      return ['tcp', 'udp'];
    }
    if (preference === 'speed') {
      return ['udp', 'tcp'];
    }
    const stateWeight: Record<TransportState, number> = {
      disconnected: 0,
      connecting: 1,
      connected: 2
    };

    const defaultOrder: TransportType[] = ['tcp', 'udp'];

    return (['tcp', 'udp'] as TransportType[])
      .map((type) => ({ type, state: this.transports[type].state }))
      .sort((a, b) => {
        const diff = stateWeight[b.state] - stateWeight[a.state];
        if (diff !== 0) {
          return diff;
        }
        return defaultOrder.indexOf(a.type) - defaultOrder.indexOf(b.type);
      })
      .map((transport) => transport.type);
  }

  private sendThroughState(
    state: TransportInternals,
    buffer: Buffer,
    overrides?: { targetAddress?: string; targetPort?: number }
  ): void {
    if (!state.socket || state.state !== 'connected') {
      throw new Error(
        `Le transport ${state.type} n'est pas pret. Impossible d'envoyer le message.`
      );
    }

    if (state.type === 'tcp') {
      const socket = state.socket as TcpSocket;
      const lengthPrefix = Buffer.alloc(4);
      lengthPrefix.writeUInt32BE(buffer.length, 0);
      const framedBuffer = Buffer.concat([lengthPrefix, buffer]);

      socket.write(framedBuffer, (error?: Error | null) => {
        if (error) {
          this.logger.error?.("[OSC][tcp] Echec lors de l'envoi", error);
          this.handleTransportFailure(state, error);
        }
      });
    } else {
      const socket = state.socket as UdpSocket;
      const targetPort = overrides?.targetPort ?? state.targetPort ?? this.options.udpPort;
      const targetHost = overrides?.targetAddress ?? state.targetHost ?? this.options.host;
      socket.send(buffer, targetPort, targetHost, (error) => {
        if (error) {
          this.logger.error?.('[OSC][udp] Echec lors de l\'envoi', error);
          this.handleTransportFailure(state, error);
        }
      });
    }
  }

  private normalisePayload(
    payload: Buffer | string | Uint8Array,
    encoding?: BufferEncoding
  ): Buffer {
    if (typeof payload === 'string') {
      return Buffer.from(payload, encoding);
    }
    if (Buffer.isBuffer(payload)) {
      return payload;
    }
    return Buffer.from(payload);
  }
}
