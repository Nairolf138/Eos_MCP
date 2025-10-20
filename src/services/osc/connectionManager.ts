import { EventEmitter } from 'node:events';
import { Socket as TcpSocket, createConnection as createTcpConnection } from 'node:net';
import { Socket as UdpSocket, createSocket as createUdpSocket } from 'node:dgram';

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
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  connectionTimeoutMs?: number;
  heartbeatPayload?: Buffer | string | Uint8Array;
  heartbeatResponseMatcher?: (data: Buffer) => boolean;
  logger?: OscConnectionLogger;
  createTcpSocket?: () => TcpSocket;
  createUdpSocket?: () => UdpSocket;
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
  heartbeatTimer: NodeJS.Timeout | null;
  heartbeatTimeoutTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  consecutiveFailures: number;
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

  private readonly reconnectDelayMs: number;

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
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 3_000;
    this.heartbeatPayload = this.normalisePayload(options.heartbeatPayload ?? 'ping');
    this.hasCustomMatcher = typeof options.heartbeatResponseMatcher === 'function';
    this.heartbeatMatcher = options.heartbeatResponseMatcher ?? (() => true);

    this.createTcpSocket = options.createTcpSocket
      ? options.createTcpSocket
      : () => createTcpConnection({ host: options.host, port: options.tcpPort });
    this.createUdpSocket = options.createUdpSocket
      ? options.createUdpSocket
      : () => {
          const socket = createUdpSocket('udp4');
          socket.connect(options.udpPort, options.host);
          return socket;
        };

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
    encoding?: BufferEncoding
  ): TransportType {
    const state = this.pickTransport(toolId);
    if (!state) {
      throw new Error(
        "Aucun transport OSC disponible pour l'outil. Les connexions TCP et UDP sont indisponibles."
      );
    }

    const buffer = this.normalisePayload(payload, encoding);
    this.sendThroughState(state, buffer);
    return state.type;
  }

  private createInitialTransportState(type: TransportType): TransportInternals {
    return {
      type,
      state: 'disconnected',
      socket: null,
      heartbeatTimer: null,
      heartbeatTimeoutTimer: null,
      reconnectTimer: null,
      lastHeartbeatSentAt: null,
      lastHeartbeatAckAt: null,
      consecutiveFailures: 0
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

    const onConnect = (): void => {
      this.logger.info?.(
        `[OSC][tcp] Connecte a ${this.options.host}:${this.options.tcpPort}`
      );
      this.onTransportConnected(state);
    };

    const onData = (chunk: Buffer): void => {
      this.markHeartbeatAck(state, chunk);
      this.emit('message', { type: 'tcp', data: chunk });
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
      this.logger.info?.(
        `[OSC][udp] Connecte a ${this.options.host}:${this.options.udpPort}`
      );
      this.onTransportConnected(state);
    };

    try {
      socket.connect(this.options.udpPort, this.options.host, markConnected);
    } catch (error) {
      throw error;
    }

    queueMicrotask(markConnected);
  }

  private onTransportConnected(state: TransportInternals): void {
    state.state = 'connected';
    state.consecutiveFailures = 0;
    state.lastHeartbeatAckAt = Date.now();
    state.lastHeartbeatSentAt = null;

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

    if (state.state !== 'disconnected') {
      state.state = 'disconnected';
      state.consecutiveFailures += 1;
      this.emit('status', this.getStatus(state.type));
    }

    if (this.running) {
      this.scheduleReconnect(state);
    }
  }

  private scheduleReconnect(state: TransportInternals): void {
    if (state.reconnectTimer || !this.running) {
      return;
    }

    this.logger.debug?.(
      `[OSC][${state.type}] Nouvelle tentative de connexion dans ${this.reconnectDelayMs}ms`
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      this.connectTransport(state.type);
    }, this.reconnectDelayMs);
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
    const tcpState = this.transports.tcp;
    const udpState = this.transports.udp;

    const order: TransportType[] = this.getTransportPriority(preference, tcpState, udpState);

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

  private getTransportPriority(
    preference: ToolTransportPreference,
    tcpState: TransportInternals,
    udpState: TransportInternals
  ): TransportType[] {
    if (preference === 'reliability') {
      return ['tcp', 'udp'];
    }
    if (preference === 'speed') {
      return ['udp', 'tcp'];
    }
    return tcpState.state === 'connected' ? ['tcp', 'udp'] : ['udp', 'tcp'];
  }

  private sendThroughState(state: TransportInternals, buffer: Buffer): void {
    if (!state.socket || state.state !== 'connected') {
      throw new Error(
        `Le transport ${state.type} n'est pas pret. Impossible d'envoyer le message.`
      );
    }

    if (state.type === 'tcp') {
      const socket = state.socket as TcpSocket;
      socket.write(buffer, (error?: Error) => {
        if (error) {
          this.logger.error?.('[OSC][tcp] Echec lors de l\'envoi', error);
          this.handleTransportFailure(state, error);
        }
      });
    } else {
      const socket = state.socket as UdpSocket;
      socket.send(buffer, (error) => {
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
