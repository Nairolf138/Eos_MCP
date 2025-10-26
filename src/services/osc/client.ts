import type {
  OscDiagnostics,
  OscLoggingOptions,
  OscLoggingState,
  OscMessage,
  OscMessageArgument
} from './index';
import type {
  ToolTransportPreference,
  TransportStatus
} from './connectionManager';
import { createOscGatewayFromEnv } from './gateway';
import type { OscConnectionStateProvider } from './connectionState';
import {
  AppError,
  ErrorCode,
  createConnectionLostError,
  createTimeoutError,
  isAppError
} from '../../server/errors';
import { getResourceCache } from '../cache/index';
import { RequestQueue, type RequestQueueRunOptions } from './requestQueue';

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
const COMMAND_REQUEST = '/eos/cmd';
const NEW_COMMAND_REQUEST = '/eos/newcmd';
const COMMAND_LINE_GET_REQUEST = '/eos/get/cmd_line';
const COMMAND_LINE_GET_REPLY = '/eos/get/cmd_line';

const DEFAULT_OPERATION_TIMEOUT_MS = 1500;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2000;

type PredicateResult<T> = T | null;

export type StepStatus = 'ok' | 'timeout' | 'error' | 'skipped';

export interface OscGatewaySendOptions {
  targetAddress?: string;
  targetPort?: number;
  toolId?: string;
  transportPreference?: ToolTransportPreference;
}

export interface OscGateway {
  send(message: OscMessage, options?: OscGatewaySendOptions): Promise<void>;
  onMessage(listener: (message: OscMessage) => void): () => void;
  setLoggingOptions?(options: OscLoggingOptions): OscLoggingState;
  getDiagnostics?(): OscDiagnostics;
  getConnectionStateProvider?(): OscConnectionStateProvider | undefined;
  setToolPreference?(toolId: string, preference: ToolTransportPreference): void;
  getToolPreference?(toolId: string): ToolTransportPreference;
  removeTool?(toolId: string): void;
  onStatus?(listener: (status: TransportStatus) => void): () => void;
  close?(): void;
}

export interface OscClientConfig {
  defaultTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  protocolTimeoutMs?: number;
  requestConcurrency?: number;
  queueTimeoutMs?: number;
}

export interface TargetOptions {
  targetAddress?: string;
  targetPort?: number;
  toolId?: string;
  transportPreference?: ToolTransportPreference;
}

export interface ConnectOptions extends TargetOptions {
  preferredProtocols?: string[];
  handshakeTimeoutMs?: number;
  protocolTimeoutMs?: number;
  clientId?: string;
}

export interface HandshakeData {
  version: string | null;
  protocols: string[];
  raw: unknown;
}

export function parseLegacyHandshakeMessage(message: OscMessage): HandshakeData | null {
  if (!message || typeof message.address !== 'string') {
    return null;
  }

  if (!message.address.startsWith('/eos/out/')) {
    return null;
  }

  return {
    version: null,
    protocols: [],
    raw: message
  };
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

export type CommandSendMode = 'append' | 'replace';

export interface CommandSendOptions extends TargetOptions {
  user?: number;
  mode?: CommandSendMode;
}

export interface CommandLineRequestOptions extends TargetOptions {
  user?: number;
  timeoutMs?: number;
}

export interface CommandLineState {
  status: StepStatus;
  text: string;
  user: number | null;
  payload: unknown;
  error?: string;
}

export interface OscJsonRequestOptions extends TargetOptions {
  payload?: Record<string, unknown>;
  responseAddress?: string;
  timeoutMs?: number;
}

export interface OscJsonResponse {
  status: StepStatus;
  data: unknown;
  payload: unknown;
  error?: string;
}

interface SendQueueOptions extends RequestQueueRunOptions {
  operation?: string;
}

export class OscClient {
  private readonly requestQueue: RequestQueue;

  private readonly requestQueueTimeoutMs: number;

  constructor(private readonly gateway: OscGateway, private readonly config: OscClientConfig = {}) {
    this.requestQueue = new RequestQueue({ concurrency: config.requestConcurrency });
    this.requestQueueTimeoutMs =
      config.queueTimeoutMs ?? config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  }

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
        protocolResponse: protocolResult.payload,
        ...(protocolResult.error ? { error: protocolResult.error } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          version: null,
          availableProtocols: [],
          selectedProtocol: null,
          protocolStatus: 'skipped',
          handshakePayload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          version: null,
          availableProtocols: [],
          selectedProtocol: null,
          protocolStatus: 'skipped',
          handshakePayload: null,
          error: connectionLostError.message
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
    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === PING_REPLY ? incoming : null),
      timeoutMs,
      'Aucune reponse ping recu avant expiration',
      'le ping OSC',
      { address: PING_REPLY }
    );

    try {
      await this.send(message, options, {
        operation: 'le ping OSC',
        timeoutMs,
        details: { address: PING_REQUEST, message: options.message }
      });
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;

      const payload = this.extractPayload(response);
      const status = this.normaliseStatus(payload);
      if (status === 'error') {
        this.ensureConnectionActive('le ping OSC', payload, { address: PING_REPLY });
      }

      const errorMessage = status === 'error' ? this.extractErrorMessage(payload) : null;
      return {
        status,
        roundtripMs: status === 'ok' ? Date.now() - startedAt : null,
        echo: this.extractEcho(payload),
        payload,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          roundtripMs: null,
          echo: null,
          payload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          roundtripMs: null,
          echo: null,
          payload: null,
          error: connectionLostError.message
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

    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === RESET_REPLY ? incoming : null),
      timeoutMs,
      'Aucune confirmation de reset recu avant expiration',
      'le reset OSC',
      { address: RESET_REPLY }
    );

    try {
      await this.send(message, options, {
        operation: 'le reset OSC',
        timeoutMs,
        details: { address: RESET_REQUEST, full: options.full ?? false }
      });
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;
      const payload = this.extractPayload(response);
      const status = this.normaliseStatus(payload);
      if (status === 'error') {
        this.ensureConnectionActive('le reset OSC', payload, { address: RESET_REPLY });
      }

      const errorMessage = status === 'error' ? this.extractErrorMessage(payload) : null;
      return {
        status,
        payload,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          payload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          payload: null,
          error: connectionLostError.message
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

    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === SUBSCRIBE_REPLY ? incoming : null),
      timeoutMs,
      'Aucune confirmation de souscription recue avant expiration',
      'la souscription OSC',
      { address: SUBSCRIBE_REPLY, path: options.path }
    );

    try {
      await this.send(
        {
          address: SUBSCRIBE_REQUEST,
          args
        },
        options,
        {
          operation: 'la souscription OSC',
          timeoutMs,
          details: { address: SUBSCRIBE_REQUEST, path: options.path }
        }
      );
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;
      const payload = this.extractPayload(response);
      const status = this.normaliseStatus(payload);
      if (status === 'error') {
        this.ensureConnectionActive('la souscription OSC', payload, {
          address: SUBSCRIBE_REPLY,
          path: options.path
        });
      }

      const errorMessage = status === 'error' ? this.extractErrorMessage(payload) : null;
      return {
        status,
        path: options.path,
        payload,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          path: options.path,
          payload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          path: options.path,
          payload: null,
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  public async sendCommand(command: string, options: CommandSendOptions = {}): Promise<void> {
    const mode = options.mode ?? 'append';
    await this.dispatchCommand(command, mode, options);
  }

  public async sendNewCommand(command: string, options: CommandSendOptions = {}): Promise<void> {
    await this.dispatchCommand(command, 'replace', options);
  }

  public async sendMessage(
    address: string,
    args: OscMessageArgument[] = [],
    options: TargetOptions = {}
  ): Promise<void> {
    const message: OscMessage = { address };
    if (args.length > 0) {
      message.args = args;
    }
    await this.send(message, options, { operation: `l'envoi du message OSC ${address}` });
  }

  public async requestJson(address: string, options: OscJsonRequestOptions = {}): Promise<OscJsonResponse> {
    const targetOptions: TargetOptions = {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      toolId: options.toolId,
      transportPreference: options.transportPreference
    };
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const responseAddress = options.responseAddress ?? address;
    const payload = options.payload ?? {};
    const hasPayload = Object.keys(payload).length > 0;
    const operation = `la requete OSC ${address}`;

    const message: OscMessage = { address };
    if (hasPayload) {
      message.args = [
        {
          type: 's',
          value: JSON.stringify(payload)
        }
      ];
    } else {
      message.args = [];
    }

    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === responseAddress ? incoming : null),
      timeoutMs,
      `Aucune reponse pour ${responseAddress} recue avant expiration`,
      operation,
      { address: responseAddress, requestAddress: address }
    );

    try {
      await this.send(message, targetOptions, {
        operation,
        timeoutMs,
        details: { address, hasPayload }
      });
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;

      const data = this.extractPayload(response);
      const status = this.normaliseStatus(data);
      if (status === 'error') {
        this.ensureConnectionActive(operation, data, {
          address: responseAddress,
          requestAddress: address
        });
      }

      const errorMessage = status === 'error' ? this.extractErrorMessage(data) : null;

      return {
        status,
        data,
        payload: response,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          data: null,
          payload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          data: null,
          payload: null,
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  public setLogging(options: OscLoggingOptions = {}): OscLoggingState {
    if (typeof this.gateway.setLoggingOptions !== 'function') {
      throw new Error('Le service OSC ne supporte pas la configuration du logging.');
    }
    return this.gateway.setLoggingOptions(options);
  }

  public getDiagnostics(): OscDiagnostics {
    if (typeof this.gateway.getDiagnostics !== 'function') {
      throw new Error('Le service OSC ne fournit pas de diagnostics.');
    }
    return this.gateway.getDiagnostics();
  }

  public onTransportStatus(listener: (status: TransportStatus) => void): () => void {
    if (typeof this.gateway.onStatus !== 'function') {
      throw new Error(
        'La passerelle OSC ne prend pas en charge la surveillance du statut des transports.'
      );
    }
    return this.gateway.onStatus(listener);
  }

  public async getCommandLine(options: CommandLineRequestOptions = {}): Promise<CommandLineState> {
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const requestPayload: Record<string, unknown> = {};

    if (typeof options.user === 'number' && Number.isFinite(options.user)) {
      requestPayload.user = Math.trunc(options.user);
    }

    const operation = 'la lecture de la ligne de commande OSC';

    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === COMMAND_LINE_GET_REPLY ? incoming : null),
      timeoutMs,
      'Aucun etat de ligne de commande recu avant expiration',
      operation,
      { address: COMMAND_LINE_GET_REPLY }
    );

    try {
      await this.send(
        {
          address: COMMAND_LINE_GET_REQUEST,
          args: [
            {
              type: 's',
              value: JSON.stringify(requestPayload)
            }
          ]
        },
        options,
        {
          operation,
          timeoutMs,
          details: { address: COMMAND_LINE_GET_REQUEST }
        }
      );
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;

      const payload = this.extractPayload(response);
      this.ensureConnectionActive(operation, payload, { address: COMMAND_LINE_GET_REPLY });
      const decoded = this.parseCommandLinePayload(payload);

      return {
        status: 'ok',
        text: decoded.text,
        user: decoded.user,
        payload
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          text: '',
          user: null,
          payload: null,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          text: '',
          user: null,
          payload: null,
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  private async send(
    message: OscMessage,
    options: TargetOptions,
    queueOptions: SendQueueOptions = {}
  ): Promise<void> {
    const operation = queueOptions.operation ?? `l'envoi du message OSC ${message.address}`;
    const timeoutMs = queueOptions.timeoutMs ?? this.requestQueueTimeoutMs;
    const details = {
      address: message.address,
      ...(queueOptions.details ?? {})
    };

    const gatewayOptions: OscGatewaySendOptions = {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      toolId: options.toolId ?? message.address,
      transportPreference: options.transportPreference
    };

    if (gatewayOptions.transportPreference && gatewayOptions.toolId) {
      this.gateway.setToolPreference?.(gatewayOptions.toolId, gatewayOptions.transportPreference);
    }

    await this.requestQueue.run(
      operation,
      () => this.gateway.send(message, gatewayOptions),
      {
        timeoutMs,
        timeoutMessage: queueOptions.timeoutMessage,
        details
      }
    );
  }

  private async dispatchCommand(
    command: string,
    mode: CommandSendMode,
    options: CommandSendOptions
  ): Promise<void> {
    const address = mode === 'replace' ? NEW_COMMAND_REQUEST : COMMAND_REQUEST;
    const args = this.buildCommandArgs(command, options.user);

    await this.send(
      {
        address,
        args
      },
      options,
      {
        operation: `l'envoi de la commande OSC ${address}`,
        details: { command }
      }
    );
  }

  private buildCommandArgs(command: string, user?: number): OscMessageArgument[] {
    const args: OscMessageArgument[] = [
      { type: 's', value: command }
    ];

    if (typeof user === 'number' && Number.isFinite(user)) {
      args.push({ type: 'i', value: Math.trunc(user) });
    }

    return args;
  }

  private async performHandshake(options: ConnectOptions, timeout: number): Promise<HandshakeData> {
    const args = [
      { type: 's', value: 'ETCOSC?' },
      { type: 's', value: options.clientId ?? 'mcp' }
    ];

    if (options.preferredProtocols?.length) {
      args.push({ type: 's', value: JSON.stringify({ preferredProtocols: options.preferredProtocols }) });
    }

    const attemptHandshake = async (attemptOptions: ConnectOptions): Promise<HandshakeData> => {
      const awaiter = this.createResponseAwaiter(
        (incoming) => (incoming.address === HANDSHAKE_REPLY ? incoming : null),
        timeout,
        'Aucune reponse de handshake recue avant expiration',
        'le handshake OSC',
        { address: HANDSHAKE_REPLY },
        { autoStartTimer: false }
      );

      const legacyAwaiter = this.createLegacyHandshakeAwaiter();

      try {
        await this.send(
          {
            address: HANDSHAKE_REQUEST,
            args
          },
          attemptOptions,
          {
            operation: 'le handshake OSC',
            timeoutMs: timeout,
            details: { address: HANDSHAKE_REQUEST }
          }
        );
        awaiter.startTimer();
        const canonicalPromise = awaiter.promise
          .then((response) => {
            legacyAwaiter.cancel();
            return this.parseHandshakeResponse(response);
          })
          .catch((error) => {
            legacyAwaiter.cancel();
            throw error;
          });

        const legacyPromise = legacyAwaiter.promise.then((legacy) => {
          awaiter.cancel();
          return legacy;
        });

        return await Promise.race([canonicalPromise, legacyPromise]);
      } catch (error) {
        awaiter.cancel();
        legacyAwaiter.cancel();
        throw error;
      }
    };

    try {
      return await attemptHandshake(options);
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      const transportForced =
        options.transportPreference === 'reliability' || options.transportPreference === 'speed';

      if (timeoutError && !transportForced) {
        const retryOptions: ConnectOptions = {
          ...options,
          transportPreference: 'speed'
        };

        return await attemptHandshake(retryOptions);
      }

      throw error;
    }
  }

  private async selectProtocol(
    handshake: HandshakeData,
    options: ConnectOptions,
    timeout: number
  ): Promise<{ status: StepStatus; selectedProtocol: string | null; payload?: unknown; error?: string }> {
    const protocols = handshake.protocols;
    if (protocols.length === 0) {
      return { status: 'skipped', selectedProtocol: null };
    }

    const candidates = options.preferredProtocols?.length ? options.preferredProtocols : protocols;
    const selection = candidates.find((protocol) => protocols.includes(protocol));
    if (!selection) {
      return { status: 'skipped', selectedProtocol: null };
    }

    const awaiter = this.createResponseAwaiter(
      (incoming) => (incoming.address === PROTOCOL_SELECT_REPLY ? incoming : null),
      timeout,
      'Aucune confirmation de protocole recue avant expiration',
      'la selection de protocole OSC',
      { address: PROTOCOL_SELECT_REPLY, selection }
    );

    try {
      await this.send(
        {
          address: PROTOCOL_SELECT_REQUEST,
          args: [{ type: 's', value: selection }]
        },
        options,
        {
          operation: 'la selection de protocole OSC',
          timeoutMs: timeout,
          details: { address: PROTOCOL_SELECT_REQUEST, selection }
        }
      );
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;
      const payload = this.extractPayload(response);
      const status = this.normaliseStatus(payload);
      if (status === 'error') {
        this.ensureConnectionActive('la selection de protocole OSC', payload, {
          address: PROTOCOL_SELECT_REPLY,
          selection
        });
      }

      const errorMessage = status === 'error' ? this.extractErrorMessage(payload) : null;
      return {
        status,
        selectedProtocol: selection,
        payload,
        ...(errorMessage ? { error: errorMessage } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          selectedProtocol: selection,
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          selectedProtocol: selection,
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  private parseHandshakeResponse(message: OscMessage): HandshakeData {
    const args = message.args ?? [];
    const sentinelArg = args[0];
    const sentinelValue = typeof sentinelArg?.value === 'string' ? sentinelArg.value : null;

    if (sentinelValue !== 'ETCOSC!') {
      throw createConnectionLostError('le handshake OSC', {
        address: HANDSHAKE_REPLY,
        message: 'Reponse de handshake invalide: sentinelle manquante ou incorrecte.',
        sentinelleAttendue: 'ETCOSC!',
        valeurRecue: sentinelValue,
        payload: message
      });
    }

    const dataArgs = args.slice(1);
    const firstDataValue = dataArgs[0]?.value;
    const payload = this.parseOscValue(firstDataValue);

    this.ensureConnectionActive('le handshake OSC', payload, {
      address: HANDSHAKE_REPLY
    });

    let version: string | null = null;
    const protocols: string[] = [];

    if (payload && typeof payload === 'object') {
      const maybeVersion = (payload as { version?: unknown }).version;
      if (typeof maybeVersion === 'string') {
        version = maybeVersion;
      }

      const maybeProtocols = (payload as { protocols?: unknown }).protocols;
      if (Array.isArray(maybeProtocols)) {
        this.appendNormalisedProtocols(protocols, maybeProtocols);
      }
    } else if (typeof payload === 'string' && payload.length > 0) {
      version = payload;
    }

    if (!version && typeof firstDataValue === 'string' && firstDataValue.length > 0) {
      version = firstDataValue;
    }

    if (dataArgs.length > 1) {
      const remaining = dataArgs.slice(1).map((arg) => arg.value);
      this.appendNormalisedProtocols(protocols, remaining);
    }

    return {
      version,
      protocols,
      raw: payload ?? message
    };
  }

  private createLegacyHandshakeAwaiter(): { promise: Promise<HandshakeData>; cancel: () => void } {
    let disposed = false;
    let cancel = (): void => {};

    const promise = new Promise<HandshakeData>((resolve) => {
      let timer: NodeJS.Timeout | null = null;
      const dispose = this.gateway.onMessage((message: OscMessage) => {
        const legacy = parseLegacyHandshakeMessage(message);
        if (!legacy) {
          return;
        }

        timer = setTimeout(() => {
          timer = null;
          if (disposed) {
            return;
          }
          disposed = true;
          dispose();
          resolve(legacy);
        }, 0);
      });

      cancel = (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        dispose();
      };
    });

    return { promise, cancel };
  }

  private parseOscValue(value: unknown): unknown {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (_error) {
        return value;
      }
    }

    if (value === undefined) {
      return null;
    }

    return value;
  }

  private appendNormalisedProtocols(target: string[], values: unknown[]): void {
    for (const value of values) {
      const normalised = this.normaliseProtocol(value);
      if (normalised && !target.includes(normalised)) {
        target.push(normalised);
      }
    }
  }

  private normaliseProtocol(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('proto:')) {
      const suffix = trimmed.slice('proto:'.length).trim();
      return suffix ? suffix : null;
    }

    return trimmed;
  }

  private extractPayload(message: OscMessage): unknown {
    const firstArg = message.args?.[0]?.value;
    if (typeof firstArg === 'string') {
      try {
        return JSON.parse(firstArg);
      } catch (_error) {
        return firstArg;
      }
    }
    return firstArg ?? null;
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (payload && typeof payload === 'object') {
      const source = payload as Record<string, unknown>;
      const candidates = ['error', 'message', 'reason', 'detail', 'status'];
      for (const key of candidates) {
        const value = source[key];
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.length > 0) {
            return trimmed;
          }
        }
      }
    }

    return null;
  }

  private parseCommandLinePayload(payload: unknown): { text: string; user: number | null } {
    if (payload && typeof payload === 'object') {
      return this.normaliseCommandLinePayload(payload as Record<string, unknown>);
    }

    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        return this.normaliseCommandLinePayload(parsed);
      } catch (_error) {
        return { text: payload, user: null };
      }
    }

    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return { text: String(payload), user: null };
    }

    return { text: '', user: null };
  }

  private normaliseCommandLinePayload(payload: Record<string, unknown>): { text: string; user: number | null } {
    const textValue = payload.text ?? payload.command ?? payload.value ?? '';
    let text = '';

    if (Array.isArray(textValue)) {
      text = textValue.map((item) => (item == null ? '' : String(item))).join('');
    } else if (textValue != null) {
      text = String(textValue);
    }

    const userValue = payload.user ?? payload.userId ?? payload.user_id ?? payload.operator ?? payload.owner ?? null;
    const user = this.decodeUser(userValue);

    return { text, user };
  }

  private decodeUser(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const match = trimmed.match(/(-?\d+)/);
      if (match) {
        return Number.parseInt(match[1] ?? '', 10);
      }
    }

    return null;
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

  private ensureConnectionActive(
    operation: string,
    payload: unknown,
    metadata: Record<string, unknown> = {}
  ): void {
    const message = this.detectConnectionLost(payload);
    if (message) {
      throw createConnectionLostError(operation, { ...metadata, message, payload });
    }
  }

  private detectConnectionLost(payload: unknown): string | null {
    const message = this.extractErrorMessage(payload);
    if (!message) {
      return null;
    }

    const normalised = message.toLowerCase();
    if (normalised.includes('connection') && (normalised.includes('lost') || normalised.includes('closed'))) {
      return message;
    }

    if (normalised.includes('disconnected')) {
      return message;
    }

    return null;
  }

  private asAppError(error: unknown, code: ErrorCode): AppError | null {
    if (isAppError(error) && error.code === code) {
      return error;
    }
    return null;
  }

  private createResponseAwaiter<T extends OscMessage>(
    matcher: (message: OscMessage) => PredicateResult<T>,
    timeoutMs: number,
    timeoutMessage: string,
    operation: string,
    metadata: Record<string, unknown> = {},
    options: { autoStartTimer?: boolean } = {}
  ): { promise: Promise<T>; cancel: () => void; startTimer: () => void } {
    let cancel = (): void => {};
    let startTimer = (): void => {};

    const promise = new Promise<T>((resolve, reject) => {
      const dispose = this.gateway.onMessage((message: OscMessage) => {
        const matched = matcher(message);
        if (matched) {
          cleanup();
          resolve(matched);
        }
      });

      let timer: NodeJS.Timeout | null = null;
      let timerStarted = false;
      let completed = false;

      const cleanup = (): void => {
        if (completed) {
          return;
        }
        completed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        dispose();
      };

      startTimer = (): void => {
        if (timerStarted || completed) {
          return;
        }
        timerStarted = true;
        timer = setTimeout(() => {
          cleanup();
          reject(
            createTimeoutError(operation, timeoutMs, timeoutMessage, { ...metadata, timeoutMessage })
          );
        }, timeoutMs);
      };

      cancel = cleanup;

      if (options.autoStartTimer ?? true) {
        startTimer();
      }
    });

    return { promise, cancel, startTimer };
  }
}

let sharedClient: OscClient | null = null;
let sharedGateway: OscGateway | null = null;
let sharedClientConfig: OscClientConfig = {};
let cacheListenerDispose: (() => void) | null = null;
let sharedConnectionStateProvider: OscConnectionStateProvider | null = null;

type OscGatewayObserver = (gateway: OscGateway) => void;

const gatewayObservers = new Set<OscGatewayObserver>();

function notifyGatewayObservers(gateway: OscGateway): void {
  gatewayObservers.forEach((observer) => {
    try {
      observer(gateway);
    } catch (error) {
      queueMicrotask(() => {
        throw error;
      });
    }
  });
}

function attachGateway(gateway: OscGateway): void {
  cacheListenerDispose?.();

  cacheListenerDispose = gateway.onMessage((message) => {
    getResourceCache().handleOscMessage(message);
  });

  sharedGateway = gateway;
  const provider = gateway.getConnectionStateProvider?.();
  if (provider) {
    sharedConnectionStateProvider = provider;
  }

  notifyGatewayObservers(gateway);
}

export function initializeOscClient(
  gateway: OscGateway | null = null,
  config: OscClientConfig = {}
): OscClient {
  if (!gateway) {
    gateway = createOscGatewayFromEnv();
  }

  sharedClientConfig = { ...config };

  attachGateway(gateway);
  sharedClient = new OscClient(gateway, config);
  return sharedClient;
}

export function resetOscClient(
  gateway: OscGateway | null = sharedGateway,
  config: OscClientConfig = sharedClientConfig
): OscClient {
  setOscClient(null);
  return initializeOscClient(gateway, config);
}

export function setOscClient(client: OscClient | null): void {
  sharedClient = client;
  if (client === null) {
    sharedGateway = null;
  }
  if (client === null && cacheListenerDispose) {
    cacheListenerDispose();
    cacheListenerDispose = null;
  }
}

export function onOscGatewayChange(
  observer: OscGatewayObserver,
  options: { immediate?: boolean } = {}
): () => void {
  gatewayObservers.add(observer);
  if ((options.immediate ?? true) && sharedGateway) {
    observer(sharedGateway);
  }

  return () => {
    gatewayObservers.delete(observer);
  };
}

export function getOscConnectionStateProvider(): OscConnectionStateProvider | null {
  return sharedConnectionStateProvider;
}

export function getOscGateway(): OscGateway {
  if (!sharedGateway) {
    throw new Error(
      "La passerelle OSC n'est pas initialise. Appelez initializeOscClient avant d'utiliser les outils."
    );
  }
  return sharedGateway;
}

export function getOscClient(): OscClient {
  if (!sharedClient) {
    throw new Error('Le client OSC n\'est pas initialise. Appelez initializeOscClient avant d\'utiliser les outils.');
  }
  return sharedClient;
}
