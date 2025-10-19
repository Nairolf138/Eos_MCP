import type { OscMessage, OscService } from './index.js';

const HANDSHAKE_REQUEST = '/eos/handshake';
const HANDSHAKE_REPLY = '/eos/handshake/reply';
const PROTOCOL_SELECT_REQUEST = '/eos/protocol/select';
const PROTOCOL_SELECT_REPLY = '/eos/protocol/select/reply';
const PING_REQUEST = '/eos/ping';
const PING_REPLY = '/eos/ping/reply';
const RESET_REQUEST = '/eos/reset';
const RESET_REPLY = '/eos/reset/reply';
const SUBSCRIBE_REQUEST = '/eos/subscribe';
const SUBSCRIBE_REPLY = '/eos/subscribe/reply';

const DEFAULT_OPERATION_TIMEOUT_MS = 1500;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2000;

type PredicateResult<T> = T | null;

export type StepStatus = 'ok' | 'timeout' | 'error' | 'skipped';

export class OscTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OscTimeoutError';
  }
}

export interface OscGateway {
  send(message: OscMessage, targetAddress?: string, targetPort?: number): void;
  onMessage(listener: (message: OscMessage) => void): () => void;
}

export interface OscClientConfig {
  defaultTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  protocolTimeoutMs?: number;
}

export interface TargetOptions {
  targetAddress?: string;
  targetPort?: number;
}

export interface ConnectOptions extends TargetOptions {
  preferredProtocols?: string[];
  handshakeTimeoutMs?: number;
  protocolTimeoutMs?: number;
  clientId?: string;
}

interface HandshakeData {
  version: string | null;
  protocols: string[];
  raw: unknown;
}

export interface ConnectResult {
  status: StepStatus;
  version: string | null;
  availableProtocols: string[];
  selectedProtocol: string | null;
  protocolStatus: StepStatus;
  handshakePayload: unknown;
  protocolResponse?: unknown;
  error?: string;
}

export interface PingOptions extends TargetOptions {
  message?: string;
  timeoutMs?: number;
}

export interface PingResult {
  status: StepStatus;
  roundtripMs: number | null;
  echo: string | null;
  payload: unknown;
  error?: string;
}

export interface ResetOptions extends TargetOptions {
  full?: boolean;
  timeoutMs?: number;
}

export interface ResetResult {
  status: StepStatus;
  payload: unknown;
  error?: string;
}

export interface SubscribeOptions extends TargetOptions {
  path: string;
  enable?: boolean;
  rateHz?: number;
  timeoutMs?: number;
}

export interface SubscribeResult {
  status: StepStatus;
  path: string;
  payload: unknown;
  error?: string;
}

export class OscClient {
  constructor(private readonly gateway: OscGateway, private readonly config: OscClientConfig = {}) {}

  public async connect(options: ConnectOptions = {}): Promise<ConnectResult> {
    const handshakeTimeout =
      options.handshakeTimeoutMs ?? this.config.handshakeTimeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    const protocolTimeout =
      options.protocolTimeoutMs ?? this.config.protocolTimeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;

    try {
      const handshake = await this.performHandshake(options, handshakeTimeout);
      const protocolResult = await this.selectProtocol(handshake, options, protocolTimeout);

      return {
        status: 'ok',
        version: handshake.version,
        availableProtocols: handshake.protocols,
        selectedProtocol: protocolResult.selectedProtocol,
        protocolStatus: protocolResult.status,
        handshakePayload: handshake.raw,
        protocolResponse: protocolResult.payload
      };
    } catch (error) {
      if (error instanceof OscTimeoutError) {
        return {
          status: 'timeout',
          version: null,
          availableProtocols: [],
          selectedProtocol: null,
          protocolStatus: 'skipped',
          handshakePayload: null,
          error: error.message
        };
      }
      throw error;
    }
  }

  public async ping(options: PingOptions = {}): Promise<PingResult> {
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const message: OscMessage = {
      address: PING_REQUEST,
      args: []
    };

    if (options.message) {
      message.args?.push({ type: 's', value: options.message });
    }

    const startedAt = Date.now();
    this.send(message, options);

    try {
      const response = await this.waitForResponse(
        (incoming) => (incoming.address === PING_REPLY ? incoming : null),
        timeoutMs,
        'Aucune reponse ping recu avant expiration'
      );

      const payload = this.extractPayload(response);
      return {
        status: 'ok',
        roundtripMs: Date.now() - startedAt,
        echo: this.extractEcho(payload),
        payload
      };
    } catch (error) {
      if (error instanceof OscTimeoutError) {
        return {
          status: 'timeout',
          roundtripMs: null,
          echo: null,
          payload: null,
          error: error.message
        };
      }
      throw error;
    }
  }

  public async reset(options: ResetOptions = {}): Promise<ResetResult> {
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const message: OscMessage = {
      address: RESET_REQUEST,
      args: [{ type: 'i', value: options.full ? 1 : 0 }]
    };

    this.send(message, options);

    try {
      const response = await this.waitForResponse(
        (incoming) => (incoming.address === RESET_REPLY ? incoming : null),
        timeoutMs,
        'Aucune confirmation de reset recu avant expiration'
      );
      const payload = this.extractPayload(response);
      return {
        status: this.normaliseStatus(payload),
        payload
      };
    } catch (error) {
      if (error instanceof OscTimeoutError) {
        return {
          status: 'timeout',
          payload: null,
          error: error.message
        };
      }
      throw error;
    }
  }

  public async subscribe(options: SubscribeOptions): Promise<SubscribeResult> {
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const args = [
      { type: 's', value: options.path },
      { type: 'i', value: options.enable === false ? 0 : 1 }
    ];

    if (typeof options.rateHz === 'number') {
      args.push({ type: 'f', value: options.rateHz });
    }

    this.send(
      {
        address: SUBSCRIBE_REQUEST,
        args
      },
      options
    );

    try {
      const response = await this.waitForResponse(
        (incoming) => (incoming.address === SUBSCRIBE_REPLY ? incoming : null),
        timeoutMs,
        'Aucune confirmation de souscription recue avant expiration'
      );
      const payload = this.extractPayload(response);
      return {
        status: this.normaliseStatus(payload),
        path: options.path,
        payload
      };
    } catch (error) {
      if (error instanceof OscTimeoutError) {
        return {
          status: 'timeout',
          path: options.path,
          payload: null,
          error: error.message
        };
      }
      throw error;
    }
  }

  private send(message: OscMessage, options: TargetOptions): void {
    this.gateway.send(message, options.targetAddress, options.targetPort);
  }

  private async performHandshake(options: ConnectOptions, timeout: number): Promise<HandshakeData> {
    const args = [
      { type: 's', value: options.clientId ?? 'mcp' }
    ];

    if (options.preferredProtocols?.length) {
      args.push({ type: 's', value: JSON.stringify({ preferredProtocols: options.preferredProtocols }) });
    }

    this.send(
      {
        address: HANDSHAKE_REQUEST,
        args
      },
      options
    );

    const response = await this.waitForResponse(
      (incoming) => (incoming.address === HANDSHAKE_REPLY ? incoming : null),
      timeout,
      'Aucune reponse de handshake recue avant expiration'
    );

    return this.parseHandshakeResponse(response);
  }

  private async selectProtocol(
    handshake: HandshakeData,
    options: ConnectOptions,
    timeout: number
  ): Promise<{ status: StepStatus; selectedProtocol: string | null; payload?: unknown }> {
    const protocols = handshake.protocols;
    if (protocols.length === 0) {
      return { status: 'skipped', selectedProtocol: null };
    }

    const candidates = options.preferredProtocols?.length ? options.preferredProtocols : protocols;
    const selection = candidates.find((protocol) => protocols.includes(protocol));
    if (!selection) {
      return { status: 'skipped', selectedProtocol: null };
    }

    this.send(
      {
        address: PROTOCOL_SELECT_REQUEST,
        args: [{ type: 's', value: selection }]
      },
      options
    );

    try {
      const response = await this.waitForResponse(
        (incoming) => (incoming.address === PROTOCOL_SELECT_REPLY ? incoming : null),
        timeout,
        'Aucune confirmation de protocole recue avant expiration'
      );
      const payload = this.extractPayload(response);
      const status = this.normaliseStatus(payload);
      return {
        status,
        selectedProtocol: selection,
        payload
      };
    } catch (error) {
      if (error instanceof OscTimeoutError) {
        return {
          status: 'timeout',
          selectedProtocol: selection
        };
      }
      throw error;
    }
  }

  private parseHandshakeResponse(message: OscMessage): HandshakeData {
    const payload = this.extractPayload(message);
    let version: string | null = null;
    let protocols: string[] = [];

    if (payload && typeof payload === 'object') {
      const maybeVersion = (payload as { version?: unknown }).version;
      if (typeof maybeVersion === 'string') {
        version = maybeVersion;
      }

      const maybeProtocols = (payload as { protocols?: unknown }).protocols;
      if (Array.isArray(maybeProtocols)) {
        protocols = maybeProtocols.filter((item): item is string => typeof item === 'string');
      }
    } else if (typeof payload === 'string') {
      version = payload;
    }

    if (!version) {
      const firstString = message.args?.find((arg) => typeof arg.value === 'string');
      if (firstString && typeof firstString.value === 'string') {
        version = firstString.value;
      }
    }

    if (protocols.length === 0 && message.args) {
      protocols = message.args
        .map((arg) => arg.value)
        .filter((value): value is string => typeof value === 'string')
        .filter((value) => value.startsWith('proto:'))
        .map((value) => value.replace('proto:', ''));
    }

    return {
      version,
      protocols,
      raw: payload ?? message
    };
  }

  private extractPayload(message: OscMessage): unknown {
    const firstArg = message.args?.[0]?.value;
    if (typeof firstArg === 'string') {
      try {
        return JSON.parse(firstArg);
      } catch (error) {
        return firstArg;
      }
    }
    return firstArg ?? null;
  }

  private extractEcho(payload: unknown): string | null {
    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const maybeEcho = (payload as { echo?: unknown }).echo;
      if (typeof maybeEcho === 'string') {
        return maybeEcho;
      }
    }

    return null;
  }

  private normaliseStatus(payload: unknown): StepStatus {
    if (payload && typeof payload === 'object') {
      const maybeStatus = (payload as { status?: unknown }).status;
      if (typeof maybeStatus === 'string') {
        return this.fromStatusString(maybeStatus);
      }
    }

    if (typeof payload === 'string') {
      return this.fromStatusString(payload);
    }

    return 'ok';
  }

  private fromStatusString(value: string): StepStatus {
    const normalised = value.trim().toLowerCase();
    if (normalised.includes('error') || normalised.includes('fail')) {
      return 'error';
    }

    if (normalised.includes('timeout')) {
      return 'timeout';
    }

    if (normalised.includes('skip')) {
      return 'skipped';
    }

    return 'ok';
  }

  private async waitForResponse<T extends OscMessage>(
    matcher: (message: OscMessage) => PredicateResult<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const dispose = this.gateway.onMessage((message: OscMessage) => {
        const matched = matcher(message);
        if (matched) {
          cleanup();
          resolve(matched);
        }
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new OscTimeoutError(timeoutMessage));
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timer);
        dispose();
      };
    });
  }
}

let sharedClient: OscClient | null = null;

export function initializeOscClient(service: OscService, config: OscClientConfig = {}): OscClient {
  sharedClient = new OscClient(service, config);
  return sharedClient;
}

export function setOscClient(client: OscClient | null): void {
  sharedClient = client;
}

export function getOscClient(): OscClient {
  if (!sharedClient) {
    throw new Error('Le client OSC n\'est pas initialise. Appelez initializeOscClient avant d\'utiliser les outils.');
  }
  return sharedClient;
}
