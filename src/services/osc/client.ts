/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    AppError,
    ErrorCode,
    createConnectionLostError,
    createTimeoutError,
    isAppError
} from '../../server/errors';
import { getRequestContext } from '../../server/requestContext';
import { resolveAuditMode, writeCommandAudit } from '../audit';
import { getResourceCache } from '../cache/index';
import { resolveConsoleTarget } from '../consoleTargets';
import type {
    ToolTransportPreference,
    TransportStatus,
    TransportType
} from './connectionManager';
import type { OscConnectionStateProvider } from './connectionState';
import { createOscGatewayFromEnv } from './gateway';
import type {
    OscDiagnostics,
    OscLoggingOptions,
    OscLoggingState,
    OscMessage,
    OscMessageArgument
} from './index';
import {
    extractJsonPayloadFromMessage,
    validateWireMessage,
    type BuiltOscWireMessage,
    type OscWireContract
} from './messageBuilders';
import { NativeQueryClient } from './nativeQueryClient';
import { OscObservations, messagePeer, normalizePeer } from './observations';
import { allowsUserScope, assertOscAddressStrictModeAllowed } from './officiality';
import { RequestQueue, type RequestQueueDiagnostics, type RequestQueueRunOptions } from './requestQueue';

const PING_REQUEST = '/eos/ping';
const PING_REPLY = '/eos/out/ping';
const RESET_REQUEST = '/eos/reset';
const SUBSCRIBE_REQUEST = '/eos/subscribe';
const COMMAND_REQUEST = '/eos/cmd';
const NEW_COMMAND_REQUEST = '/eos/newcmd';
const USER_REQUEST = '/eos/user';
const COMMAND_LINE_OUT_GLOBAL = '/eos/out/cmd';
const COMMAND_LINE_OUT_USER_PATTERN = /^\/eos\/out\/user\/(-?\d+)\/cmd$/;
const JSON_STATUS_REQUIRED_ENDPOINTS = new Set<string>([
  '/eos/get/cue'
]);

const DEFAULT_OPERATION_TIMEOUT_MS = 1500;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2000;

type PredicateResult<T> = T | null;

export type StepStatus = 'ok' | 'timeout' | 'error' | 'skipped' | 'unsupported_transport_mode' | 'read_capability_unconfirmed';

export type ReadJsonCapabilityStatus = 'confirmed' | 'unsupported_transport_mode' | 'read_capability_unconfirmed';

export interface OscRuntimeCapabilities {
  canReadJsonQueries: boolean;
  readJsonQueriesStatus: ReadJsonCapabilityStatus;
  reason: string | null;
}

export interface OscGatewaySendOptions {
  targetConsole?: string;
  targetAddress?: string;
  targetPort?: number;
  toolId?: string;
  correlationId?: string;
  transportPreference?: ToolTransportPreference;
}

export interface OscGateway {
  send(message: OscMessage, options?: OscGatewaySendOptions): Promise<void | TransportType>;
  onMessage(listener: (message: OscMessage) => void): () => void;
  setLoggingOptions?(options: OscLoggingOptions): OscLoggingState;
  getDiagnostics?(): OscDiagnostics;
  getConnectionStateProvider?(): OscConnectionStateProvider | undefined;
  setToolPreference?(toolId: string, preference: ToolTransportPreference): void;
  getToolPreference?(toolId: string): ToolTransportPreference;
  getActiveTransport?(toolId: string): TransportType | null;
  removeTool?(toolId: string): void;
  onStatus?(listener: (status: TransportStatus) => void): () => void;
  getTransportStatuses?(): TransportStatus[];
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
  targetConsole?: string;
  targetAddress?: string;
  targetPort?: number;
  toolId?: string;
  transportPreference?: ToolTransportPreference;
  wireContract?: OscWireContract;
}

export interface ConnectOptions extends TargetOptions {
  preferredProtocols?: string[];
  handshakeTimeoutMs?: number;
  protocolTimeoutMs?: number;
  clientId?: string;
}

export type HandshakeMode = 'native' | 'canonical' | 'legacy' | 'timeout' | 'degraded';

export interface HandshakeData {
  version: string | null;
  protocols: string[];
  raw: unknown;
  mode: Extract<HandshakeMode, 'canonical' | 'legacy'>;
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
    raw: message,
    mode: 'legacy'
  };
}

export interface ConnectResult extends Record<string, unknown> {
  status: StepStatus;
  version: string | null;
  availableProtocols: string[];
  selectedProtocol: string | null;
  protocolStatus: StepStatus;
  handshakePayload: unknown;
  can_send_commands: boolean;
  can_read_queries: boolean;
  handshake_mode: HandshakeMode;
  limitations: string[];
  protocolResponse?: unknown;
  error?: string;
}

export interface PingOptions extends TargetOptions {
  message?: string;
  timeoutMs?: number;
}

export interface PingResult extends Record<string, unknown> {
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

export interface ResetResult extends Record<string, unknown> {
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

export interface SubscribeResult extends Record<string, unknown> {
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
  afterSequence?: number;
  maxAgeMs?: number;
  timeoutMs?: number;
}

export type CommandLineSource = 'official_osc_out' | 'mcp_extension_get_cmd_line';

export interface CommandLineState extends Record<string, unknown> {
  status: StepStatus;
  text: string;
  user: number | null;
  payload: unknown;
  source: CommandLineSource | null;
  sequence?: number;
  received_at?: number;
  command_error?: boolean;
  error?: string;
}

export type OscJsonResponseShape = 'object' | 'any-json' | 'scalar' | 'array' | 'text';

export interface OscJsonRequestOptions extends TargetOptions {
  payload?: Record<string, unknown>;
  responseAddress?: string;
  responseAddresses?: readonly string[];
  timeoutMs?: number;
  bypassReadCapabilityCheck?: boolean;
  responseShape?: OscJsonResponseShape;
}

export type OscPayloadParseType = 'json' | 'plain_text' | 'empty' | 'invalid_json';

export type OscPayloadParseResult =
  | { type: 'json'; data: unknown; rawPayload: string | null; rawPayloadExcerpt: string }
  | { type: 'plain_text'; data: string; rawPayload: string; rawPayloadExcerpt: string }
  | { type: 'empty'; data: null; rawPayload: string | null; rawPayloadExcerpt: string }
  | { type: 'invalid_json'; data: string; rawPayload: string; rawPayloadExcerpt: string; error: string };

export interface OscJsonDiagnostics {
  requestAddress: string;
  responseAddress: string | null;
  acceptedResponseAddresses: string[];
  transportType: TransportType | 'unknown';
  timeoutMs: number;
  payloadType: OscPayloadParseType;
  rawPayloadExcerpt: string;
  handshakeStatus: StepStatus | null;
  protocolMode: string | null;
}

export interface OscJsonResponse {
  status: StepStatus;
  data: unknown;
  payload: unknown;
  diagnostics?: OscJsonDiagnostics;
  error?: string;
}

interface InternalOscJsonRequestOptions {
  responseShape?: OscJsonResponseShape;
  requireStatusResponse?: boolean;
  bypassReadCapabilityCheck?: boolean;
}

interface SendQueueOptions extends RequestQueueRunOptions {
  operation?: string;
}

export type OscQueueFamily = 'command-line' | 'session-control' | 'show-control';

export interface OscQueuePolicy {
  targetKey: string;
  familyKey?: OscQueueFamily;
}

export type OscQueueDiagnostics = RequestQueueDiagnostics;

export class OscClient {
  private readonly nativeQueries = new NativeQueryClient();
  private readonly requestQueue: RequestQueue;

  private readonly requestQueueTimeoutMs: number;

  private lastHandshakeStatus: StepStatus | null = null;

  private lastProtocolMode: string | null = null;

  private readJsonCapability: OscRuntimeCapabilities = {
    canReadJsonQueries: false,
    readJsonQueriesStatus: 'read_capability_unconfirmed',
    reason: 'Aucune lecture native OSC confirmee dans cette session.'
  };

  private readJsonCapabilityChecked = false;

  private readonly commandLineState = new Map<string, CommandLineState>();

  private commandLineSequence = 0;

  private readonly observations = new OscObservations();

  private readonly disposeCommandLineStateListener: () => void;

  constructor(private readonly gateway: OscGateway, private readonly config: OscClientConfig = {}) {
    this.requestQueue = new RequestQueue({ concurrency: config.requestConcurrency });
    this.requestQueueTimeoutMs =
      config.queueTimeoutMs ?? config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    this.disposeCommandLineStateListener = this.gateway.onMessage((message) => {
      this.observations.remember(message);
      this.rememberCommandLineMessage(message);
    });
  }

  public dispose(): void { this.disposeCommandLineStateListener(); }

  public getRuntimeCapabilities(): OscRuntimeCapabilities {
    return { ...this.readJsonCapability };
  }

  public get canReadJsonQueries(): boolean {
    return this.readJsonCapability.canReadJsonQueries;
  }

  public async probeCapabilities(options: TargetOptions & { timeoutMs?: number } = {}): Promise<OscRuntimeCapabilities> {
    const timeoutMs = options.timeoutMs ?? Math.min(this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS, 400);
    const response = await this.requestJsonInternal('/eos/get/version', {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      toolId: options.toolId,
      transportPreference: options.transportPreference,
      timeoutMs,
      responseAddresses: ['/eos/get/version', '/eos/out/get/version'],
      bypassReadCapabilityCheck: true
    }, {
      responseShape: 'any-json',
      bypassReadCapabilityCheck: true
    });

    const capability: OscRuntimeCapabilities = response.status === 'ok'
      ? {
        canReadJsonQueries: true,
        readJsonQueriesStatus: 'confirmed',
        reason: null
      }
      : {
        canReadJsonQueries: false,
        readJsonQueriesStatus: 'read_capability_unconfirmed',
        reason: response.error ?? `Lecture native de version terminee avec le statut ${response.status}.`
      };

    this.setReadJsonCapability(
      capability.canReadJsonQueries,
      capability.readJsonQueriesStatus,
      capability.reason
    );
    return this.getRuntimeCapabilities();
  }

  public async connect(options: ConnectOptions = {}): Promise<ConnectResult> {
    const response = await this.requestJsonInternal('/eos/get/version', {
      ...options, timeoutMs: options.handshakeTimeoutMs ?? this.config.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      bypassReadCapabilityCheck: true
    });
    const readable = response.status === 'ok';
    this.setReadJsonCapability(readable, readable ? 'confirmed' : 'read_capability_unconfirmed', response.error ?? null);
    this.lastHandshakeStatus = response.status;
    this.lastProtocolMode = readable ? 'etc-osc' : null;
    const data = response.data as { version?: string } | null;
    return {
      status: response.status, version: readable ? data?.version ?? null : null,
      availableProtocols: readable ? ['etc-osc'] : [], selectedProtocol: readable ? 'etc-osc' : null,
      protocolStatus: readable ? 'ok' : 'skipped', handshakePayload: response.payload,
      can_send_commands: readable, can_read_queries: readable, handshake_mode: readable ? 'native' : 'timeout',
      limitations: readable ? [] : [response.error ?? 'Lecture de version Eos non confirmee.'],
      ...(response.error ? { error: response.error } : {})
    };
  }

  private setReadJsonCapability(
    canReadJsonQueries: boolean,
    readJsonQueriesStatus: ReadJsonCapabilityStatus,
    reason: string | null
  ): OscRuntimeCapabilities {
    this.readJsonCapabilityChecked = true;
    this.readJsonCapability = { canReadJsonQueries, readJsonQueriesStatus, reason };
    return this.getRuntimeCapabilities();
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
    await this.send({ address: RESET_REQUEST, args: [] }, options);
    this.commandLineState.clear();
    return { status: 'ok', payload: { sent_to_transport: true, verified: false, acknowledgement: 'ETC ne documente pas de reponse /reset/reply.' } };
  }

  public async subscribe(options: SubscribeOptions): Promise<SubscribeResult> {
    if (options.rateHz !== undefined) throw new Error('rateHz ne fait pas partie du protocole OSC Subscribe ETC.');
    const parameter = options.path.match(/^\/eos\/(?:out\/)?(?:subscribe\/)?param\/([^/]+)$/)?.[1];
    if (!parameter && !['/eos', '/eos/out', '/eos/subscribe'].includes(options.path) && !/^\/eos\/out\/notify(?:\/[a-z0-9_]+)?$/i.test(options.path)) {
      throw new Error('Abonnement invalide: utiliser /eos pour le show ou /eos/param/<parametre>.');
    }
    const address = parameter ? `/eos/subscribe/param/${parameter}` : SUBSCRIBE_REQUEST;
    await this.send({ address, args: [{ type: 'i', value: options.enable === false ? 0 : 1 }] }, options);
    return { status: 'ok', path: options.path, payload: { address, enabled: options.enable !== false, scope: parameter ?? 'all_show_data', sent_to_transport: true, verified: false } };
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
    return this.requestJsonInternal(address, options, {
      responseShape: options.responseShape ?? 'object',
      requireStatusResponse: JSON_STATUS_REQUIRED_ENDPOINTS.has(address)
    });
  }

  private async requestJsonInternal(
    address: string,
    options: OscJsonRequestOptions = {},
    _internalOptions: InternalOscJsonRequestOptions = {}
  ): Promise<OscJsonResponse> {
    const target = resolveConsoleTarget(options);
    const peer = normalizePeer(target.targetAddress);
    if (address.startsWith('/eos/out/')) {
      const read = () => this.observations.read(address, options.payload ?? {}, peer);
      const cached = read();
      if (cached) return { status: 'ok', ...cached };
      return new Promise<OscJsonResponse>((resolve) => {
        const dispose = this.gateway.onMessage(() => {
          const observed = read();
          if (observed) { clearTimeout(timer); dispose(); resolve({ status: 'ok', ...observed }); }
        });
        const timer = setTimeout(() => {
          dispose(); resolve({ status: 'timeout', data: null, payload: null,
            error: `Aucun evenement Eos recent pour ${address}; aucune requete /get equivalente documentee.` });
        }, options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS);
      });
    }
    const result = await this.nativeQueries.request(address, options.payload ?? {},
      options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS, {
        send: (nativeAddress) => this.send({ address: nativeAddress, args: [] }, options),
        onMessage: (listener) => this.gateway.onMessage((message) => {
          if (messagePeer(message) === null || messagePeer(message) === peer) listener(message);
        })
      });
    if (result.status === 'ok') this.setReadJsonCapability(true, 'confirmed', null);
    return result;
  }

  public async requestBuiltJson(
    request: BuiltOscWireMessage,
    options: Omit<OscJsonRequestOptions, 'payload'> = {}
  ): Promise<OscJsonResponse> {
    validateWireMessage(request.contract, request.message);
    return this.requestJson(request.message.address, {
      ...options,
      payload: request.query ?? extractJsonPayloadFromMessage(request.message)
    });
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
    return {
      ...this.gateway.getDiagnostics(),
      queue: this.getQueueDiagnostics()
    };
  }

  public getQueueDiagnostics(): OscQueueDiagnostics {
    return this.requestQueue.getDiagnostics();
  }

  public getTransportStatuses(): TransportStatus[] {
    if (typeof this.gateway.getTransportStatuses === 'function') {
      return this.gateway.getTransportStatuses();
    }
    return [];
  }

  public onTransportStatus(listener: (status: TransportStatus) => void): () => void {
    if (typeof this.gateway.onStatus !== 'function') {
      throw new Error(
        'La passerelle OSC ne prend pas en charge la surveillance du statut des transports.'
      );
    }
    return this.gateway.onStatus(listener);
  }

  public getCommandLineSequence(): number { return this.commandLineSequence; }

  public async getCommandLine(options: CommandLineRequestOptions = {}): Promise<CommandLineState> {
    const user = options.user ?? null;
    const acceptable = (state: CommandLineState | undefined): state is CommandLineState => Boolean(state
      && state.user === user
      && (options.afterSequence === undefined || (state.sequence ?? -1) > options.afterSequence)
      && Date.now() - (state.received_at ?? 0) <= (options.maxAgeMs ?? 2000));
    const peer = normalizePeer(resolveConsoleTarget(options).targetAddress);
    const key = `${peer}:${user === null ? 'global' : `user:${user}`}`;
    const cached = this.commandLineState.get(key);
    if (acceptable(cached)) return { ...cached };
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    return new Promise<CommandLineState>((resolve) => {
      const dispose = this.gateway.onMessage(() => {
        const current = this.commandLineState.get(key);
        if (acceptable(current)) { clearTimeout(timer); dispose(); resolve({ ...current }); }
      });
      const timer = setTimeout(() => {
        dispose(); resolve({ status: 'timeout', text: '', user, payload: null, source: null,
          error: 'Aucun retour de ligne de commande Eos recent. Aucun endpoint /get/cmd_line n’est documente.' });
      }, timeoutMs);
    });
  }

  private rememberCommandLineMessage(message: OscMessage): void {
    const match = message.address.match(COMMAND_LINE_OUT_USER_PATTERN);
    if (message.address !== COMMAND_LINE_OUT_GLOBAL && !match) return;
    const text = message.args?.[0]?.value;
    if (typeof text !== 'string') return;
    const flag = message.args?.[1]?.type === 'T' ? true : message.args?.[1]?.type === 'F' ? false : message.args?.[1]?.value;
    const user = match ? Number(match[1]) : null;
    const commandError = flag === 1 || flag === true;
    const state: CommandLineState = {
      status: commandError ? 'error' : 'ok', text, user, payload: message, source: 'official_osc_out',
      sequence: ++this.commandLineSequence, received_at: Date.now(),
      ...([0, 1, true, false].includes(flag as number | boolean) ? { command_error: commandError } : {}),
      ...(commandError ? { error: 'Eos signale une erreur sur sa ligne de commande.' } : {})
    };
    const peer = messagePeer(message) ?? normalizePeer(resolveConsoleTarget({}).targetAddress);
    this.commandLineState.set(`${peer}:${user === null ? 'global' : `user:${user}`}`, state);
  }

  private async send(
    message: OscMessage,
    options: TargetOptions,
    queueOptions: SendQueueOptions = {}
  ): Promise<TransportType | null> {
    if (options.wireContract) validateWireMessage(options.wireContract, message);
    const user = (options as CommandSendOptions).user ?? getRequestContext()?.userId;
    if (user !== undefined && !message.address.startsWith('/eos/user/') && allowsUserScope(message.address)) {
      if (!Number.isInteger(user) || user < 0 || user > 99) throw new Error('Utilisateur Eos invalide (0..99).');
      message = { ...message, address: message.address.replace('/eos/', `/eos/user/${user}/`) };
    }
    assertOscAddressStrictModeAllowed(message.address);
    const previewContext = getRequestContext();
    if (previewContext?.dryRun && !message.address.startsWith('/eos/get/')) {
      previewContext.oscPreview?.push({ address: message.address, args: message.args ?? [] });
      return null;
    }
    const operation = queueOptions.operation ?? `l'envoi du message OSC ${message.address}`;
    const timeoutMs = queueOptions.timeoutMs ?? this.requestQueueTimeoutMs;
    const details = {
      address: message.address,
      ...(queueOptions.details ?? {})
    };

    const hasExplicitTarget = Boolean(options.targetConsole ?? options.targetAddress ?? options.targetPort);
    const resolvedTarget = hasExplicitTarget
      ? resolveConsoleTarget({
        targetConsole: options.targetConsole,
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      })
      : null;
    const gatewayOptions: OscGatewaySendOptions = {
      targetConsole: resolvedTarget?.targetConsole ?? undefined,
      targetAddress: resolvedTarget?.targetAddress,
      targetPort: resolvedTarget?.targetPort,
      toolId: options.toolId ?? message.address,
      correlationId: getRequestContext()?.correlationId,
      transportPreference: options.transportPreference
    };


    if (gatewayOptions.transportPreference && gatewayOptions.toolId) {
      this.gateway.setToolPreference?.(gatewayOptions.toolId, gatewayOptions.transportPreference);
    }

    const queuePolicy = this.buildQueuePolicy(message.address, gatewayOptions);

    let transportType: TransportType | null = null;
    const requestContext = getRequestContext();
    const auditBase = {
      toolName: requestContext?.toolName ?? gatewayOptions.toolId ?? message.address,
      oscAddress: message.address,
      args: message.args ?? [],
      eosUser: typeof requestContext?.userId === 'number' ? requestContext.userId : this.extractUserFromMessage(message, queueOptions.details),
      mode: resolveAuditMode(),
      delivery: 'sent' as const,
      correlationId: requestContext?.correlationId,
      sessionId: requestContext?.sessionId,
      target: {
        ...(gatewayOptions.targetConsole ? { console: gatewayOptions.targetConsole } : {}),
        ...(gatewayOptions.targetAddress ? { address: gatewayOptions.targetAddress } : {}),
        ...(typeof gatewayOptions.targetPort === 'number' ? { port: gatewayOptions.targetPort } : {})
      }
    };

    try {
      await this.requestQueue.run(
        operation,
        () => this.gateway.send(message, gatewayOptions).then((sentTransport) => {
          transportType = sentTransport ?? this.gateway.getActiveTransport?.(gatewayOptions.toolId ?? message.address) ?? null;
        }),
        {
          timeoutMs,
          timeoutMessage: queueOptions.timeoutMessage,
          details,
          targetKey: queuePolicy.targetKey,
          familyKey: queueOptions.familyKey ?? queuePolicy.familyKey
        }
      );

      const finalTransport = transportType ?? this.gateway.getActiveTransport?.(gatewayOptions.toolId ?? message.address) ?? null;
      writeCommandAudit({
        ...auditBase,
        status: 'ok',
        result: { transport: finalTransport }
      });
      return finalTransport;
    } catch (error) {
      writeCommandAudit({
        ...auditBase,
        status: 'error',
        error: error instanceof Error ? { name: error.name, message: error.message } : error
      });
      throw error;
    }
  }


  private extractUserFromMessage(message: OscMessage, details?: Record<string, unknown>): number | null {
    const detailUser = details?.user;
    if (typeof detailUser === 'number' && Number.isFinite(detailUser)) {
      return Math.trunc(detailUser);
    }

    if (message.address === USER_REQUEST) {
      const argUser = message.args?.[0]?.value;
      if (typeof argUser === 'number' && Number.isFinite(argUser)) {
        return Math.trunc(argUser);
      }
    }

    return null;
  }

  private buildQueuePolicy(address: string, options: OscGatewaySendOptions): OscQueuePolicy {
    return {
      targetKey: this.buildQueueTargetKey(options),
      ...(this.getSensitiveFamily(address) ? { familyKey: this.getSensitiveFamily(address) } : {})
    };
  }

  private buildQueueTargetKey(options: OscGatewaySendOptions): string {
    return [
      options.targetConsole ?? 'default-console',
      options.targetAddress ?? 'default-address',
      typeof options.targetPort === 'number' ? String(options.targetPort) : 'default-port',
      options.transportPreference ?? 'auto'
    ].join('|');
  }

  private getSensitiveFamily(address: string): OscQueueFamily | undefined {
    if (
      address === COMMAND_REQUEST ||
      address === NEW_COMMAND_REQUEST ||
      address === USER_REQUEST || /^\/eos\/user\/\d+\/(?:newcmd|cmd)$/.test(address)
    ) {
      return 'command-line';
    }

    if (address === '/eos/get/version' || address === SUBSCRIBE_REQUEST) {
      return 'session-control';
    }

    if (address === RESET_REQUEST) {
      return 'show-control';
    }

    return undefined;
  }

  private async dispatchCommand(
    command: string,
    mode: CommandSendMode,
    options: CommandSendOptions
  ): Promise<void> {
    const baseAddress = mode === 'replace' ? NEW_COMMAND_REQUEST : COMMAND_REQUEST;
    if (options.user !== undefined && (!Number.isInteger(options.user) || options.user < 0 || options.user > 99)) {
      throw new Error('Un utilisateur OSC Eos doit etre un entier de 0 a 99.');
    }
    const address = options.user === undefined ? baseAddress : baseAddress.replace('/eos/', `/eos/user/${options.user}/`);

    const args = this.buildCommandArgs(command);

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

  private buildCommandArgs(command: string): OscMessageArgument[] {
    return [
      { type: 's', value: command }
    ];
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

        if (value && typeof value === 'object') {
          const nested = this.extractErrorMessage(value);
          if (nested) {
            return nested;
          }
        }
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
        return this.fromStatusString(maybeStatus) ?? 'ok';
      }
    }

    if (typeof payload === 'string') {
      return this.fromStatusString(payload) ?? 'ok';
    }

    return 'ok';
  }

  private fromStatusString(value: string, strict = false): StepStatus | null {
    const normalised = value.trim().toLowerCase();
    if (!normalised) {
      return null;
    }

    if (['ok', 'okay', 'success', 'successful', 'done'].includes(normalised)) {
      return 'ok';
    }

    if (['error', 'failed', 'failure', 'fail'].includes(normalised)) {
      return 'error';
    }

    if (normalised === 'timeout' || normalised === 'timed_out') {
      return 'timeout';
    }

    if (normalised === 'skip' || normalised === 'skipped') {
      return 'skipped';
    }

    if (!strict) {
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

    return null;
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

    // Attach immediately: send() can still be waiting when the response timer expires.
    // Awaiting the original promise below continues to report the rejection normally.
    void promise.catch(() => {});
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
  if (sharedClient !== client) sharedClient?.dispose?.();
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
