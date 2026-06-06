/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  OscDiagnostics,
  OscLoggingOptions,
  OscLoggingState,
  OscMessage,
  OscMessageArgument
} from './index';
import type {
  ToolTransportPreference,
  TransportStatus,
  TransportType
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
import { resolveConsoleTarget } from '../consoleTargets';
import { RequestQueue, type RequestQueueDiagnostics, type RequestQueueRunOptions } from './requestQueue';
import { getRequestContext } from '../../server/requestContext';
import { resolveAuditMode, writeCommandAudit } from '../audit';
import { assertOscAddressStrictModeAllowed } from './officiality';
import {
  extractJsonPayloadFromMessage,
  isDocumentedJsonEndpoint,
  validateWireMessage,
  type BuiltOscWireMessage,
  type OscWireContract
} from './messageBuilders';

const HANDSHAKE_REQUEST = '/eos/handshake';
const HANDSHAKE_REPLY = '/eos/handshake/reply';
const PROTOCOL_SELECT_REQUEST = '/eos/protocol/select';
const PROTOCOL_SELECT_REPLY = '/eos/protocol/select/reply';
const PING_REQUEST = '/eos/ping';
const PING_REPLY = '/eos/out/ping';
const RESET_REQUEST = '/eos/reset';
const RESET_REPLY = '/eos/reset/reply';
const SUBSCRIBE_REQUEST = '/eos/subscribe';
const SUBSCRIBE_REPLY = '/eos/subscribe/reply';
const COMMAND_REQUEST = '/eos/cmd';
const NEW_COMMAND_REQUEST = '/eos/newcmd';
const USER_REQUEST = '/eos/user';
const COMMAND_LINE_GET_REQUEST = '/eos/get/cmd_line';
const COMMAND_LINE_GET_REPLY = '/eos/get/cmd_line';
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

export type HandshakeMode = 'canonical' | 'legacy' | 'timeout' | 'degraded';

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
  timeoutMs?: number;
}

export type CommandLineSource = 'official_osc_out' | 'mcp_extension_get_cmd_line';

export interface CommandLineState extends Record<string, unknown> {
  status: StepStatus;
  text: string;
  user: number | null;
  payload: unknown;
  source: CommandLineSource | null;
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
  private readonly requestQueue: RequestQueue;

  private readonly requestQueueTimeoutMs: number;

  private lastHandshakeStatus: StepStatus | null = null;

  private lastProtocolMode: string | null = null;

  private readJsonCapability: OscRuntimeCapabilities = {
    canReadJsonQueries: false,
    readJsonQueriesStatus: 'read_capability_unconfirmed',
    reason: 'Aucun handshake/probe OSC de lecture JSON reussi dans cette session.'
  };

  private readJsonCapabilityChecked = false;

  private readonly commandLineState = new Map<string, CommandLineState>();

  private readonly disposeCommandLineStateListener: () => void;

  constructor(private readonly gateway: OscGateway, private readonly config: OscClientConfig = {}) {
    this.requestQueue = new RequestQueue({ concurrency: config.requestConcurrency });
    this.requestQueueTimeoutMs =
      config.queueTimeoutMs ?? config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    this.disposeCommandLineStateListener = this.gateway.onMessage((message) => {
      this.rememberCommandLineMessage(message);
    });
  }

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
        reason: response.error ?? `Probe JSON EOS termine avec le statut ${response.status}.`
      };

    this.setReadJsonCapability(
      capability.canReadJsonQueries,
      capability.readJsonQueriesStatus,
      capability.reason
    );
    return this.getRuntimeCapabilities();
  }

  public async connect(options: ConnectOptions = {}): Promise<ConnectResult> {
    const handshakeTimeout =
      options.handshakeTimeoutMs ?? this.config.handshakeTimeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    const protocolTimeout =
      options.protocolTimeoutMs ?? this.config.protocolTimeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;

    try {
      const handshake = await this.performHandshake(options, handshakeTimeout);
      const protocolResult = await this.selectProtocol(handshake, options, protocolTimeout);
      const capability = handshake.mode === 'canonical'
        ? this.setReadJsonCapability(true, 'confirmed', null)
        : await this.probeCapabilities({
          targetAddress: options.targetAddress,
          targetPort: options.targetPort,
          toolId: options.toolId,
          transportPreference: options.transportPreference,
          timeoutMs: Math.min(protocolTimeout, 400)
        });
      if (!capability.canReadJsonQueries && handshake.mode === 'legacy') {
        this.setReadJsonCapability(false, 'unsupported_transport_mode', capability.reason ?? 'Handshake legacy: lecture JSON non confirmee.');
      }
      const runtimeCapability = this.getRuntimeCapabilities();
      this.lastHandshakeStatus = 'ok';
      this.lastProtocolMode = protocolResult.selectedProtocol ?? handshake.mode;

      return {
        status: 'ok',
        version: handshake.version,
        availableProtocols: handshake.protocols,
        selectedProtocol: protocolResult.selectedProtocol,
        protocolStatus: protocolResult.status,
        handshakePayload: handshake.raw,
        can_send_commands: true,
        can_read_queries: runtimeCapability.canReadJsonQueries,
        handshake_mode: handshake.mode,
        limitations: this.buildConnectionLimitations(
          handshake.mode,
          true,
          runtimeCapability.canReadJsonQueries,
          protocolResult.status,
          protocolResult.error ?? runtimeCapability.reason ?? undefined
        ),
        protocolResponse: protocolResult.payload,
        ...(protocolResult.error ? { error: protocolResult.error } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return this.buildTimeoutConnectResult(options, timeoutError.message);
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        this.lastHandshakeStatus = 'error';
        this.lastProtocolMode = 'timeout';
        this.setReadJsonCapability(false, 'read_capability_unconfirmed', connectionLostError.message);
        return {
          status: 'error',
          version: null,
          availableProtocols: [],
          selectedProtocol: null,
          protocolStatus: 'skipped',
          handshakePayload: null,
          can_send_commands: false,
          can_read_queries: false,
          handshake_mode: 'timeout',
          limitations: this.buildConnectionLimitations('timeout', false, false, 'skipped', connectionLostError.message),
          error: connectionLostError.message
        };
      }

      throw error;
    }
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
    return this.requestJsonInternal(address, options, {
      responseShape: options.responseShape ?? 'object',
      requireStatusResponse: JSON_STATUS_REQUIRED_ENDPOINTS.has(address)
    });
  }

  private async requestJsonInternal(
    address: string,
    options: OscJsonRequestOptions = {},
    internalOptions: InternalOscJsonRequestOptions = {}
  ): Promise<OscJsonResponse> {
    if (!isDocumentedJsonEndpoint(address)) {
      throw new Error(
        `requestJson n'est pas autorise pour l'adresse '${address}'. Utilisez un builder specialise + sendMessage.`
      );
    }
    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    if (options.bypassReadCapabilityCheck !== true && internalOptions.bypassReadCapabilityCheck !== true && this.readJsonCapabilityChecked && !this.readJsonCapability.canReadJsonQueries) {
      const responseAddresses = this.normaliseResponseAddresses(
        address,
        options.responseAddress,
        options.responseAddresses
      );
      return this.buildReadCapabilityRefusal(address, responseAddresses, timeoutMs);
    }
    const targetOptions: TargetOptions = {
      targetConsole: options.targetConsole,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      toolId: options.toolId,
      transportPreference: options.transportPreference
    };
    const responseAddresses = this.normaliseResponseAddresses(
      address,
      options.responseAddress,
      options.responseAddresses
    );
    const responseAddressSet = new Set(responseAddresses);
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
      (incoming) => (responseAddressSet.has(incoming.address) ? incoming : null),
      timeoutMs,
      `Aucune reponse pour ${responseAddresses.join(' ou ')} recue avant expiration`,
      operation,
      { address: responseAddresses, requestAddress: address }
    );

    let transportType: TransportType | 'unknown' = 'unknown';

    try {
      transportType = await this.send(message, targetOptions, {
        operation,
        timeoutMs,
        details: { address, hasPayload }
      }) ?? 'unknown';
    } catch (error) {
      awaiter.cancel();
      throw error;
    }

    try {
      const response = await awaiter.promise;

      const parsed = this.parseOscPayload(response);
      const diagnostics = this.buildJsonDiagnostics(address, response.address, responseAddresses, parsed, timeoutMs, transportType);

      const responseShape = internalOptions.responseShape ?? options.responseShape ?? 'object';
      const requireStatusResponse = internalOptions.requireStatusResponse === true;
      const formatError = this.validatePayloadShape(parsed, responseShape, requireStatusResponse);
      if (formatError) {
        return {
          status: 'error',
          data: parsed.type === 'json' ? parsed.data : null,
          payload: response,
          diagnostics,
          error: this.withJsonDiagnostics(formatError, diagnostics)
        };
      }

      const data = parsed.data;
      const statusResult = this.normaliseJsonStatus(data, requireStatusResponse);
      if (statusResult.status === 'error') {
        this.ensureConnectionActive(operation, data, {
          address: response.address,
          acceptedResponseAddresses: responseAddresses,
          requestAddress: address,
          payloadType: diagnostics.payloadType,
          rawPayloadExcerpt: diagnostics.rawPayloadExcerpt
        });
      }

      if (statusResult.status === 'ok') {
        this.setReadJsonCapability(true, 'confirmed', null);
      } else if (options.bypassReadCapabilityCheck === true || internalOptions.bypassReadCapabilityCheck === true) {
        this.setReadJsonCapability(
          false,
          'read_capability_unconfirmed',
          statusResult.error ?? `Probe JSON EOS termine avec le statut ${statusResult.status}.`
        );
      }

      return {
        status: statusResult.status,
        data,
        payload: response,
        diagnostics,
        ...(statusResult.error ? { error: statusResult.error } : {})
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        if (options.bypassReadCapabilityCheck === true || internalOptions.bypassReadCapabilityCheck === true) {
          this.setReadJsonCapability(false, 'read_capability_unconfirmed', timeoutError.message);
        }
        return {
          status: 'timeout',
          data: null,
          payload: null,
          diagnostics: this.buildJsonDiagnostics(address, null, responseAddresses, this.emptyPayloadParseResult(), timeoutMs, transportType),
          error: timeoutError.message
        };
      }

      const connectionLostError = this.asAppError(error, ErrorCode.OSC_CONNECTION_LOST);
      if (connectionLostError) {
        return {
          status: 'error',
          data: null,
          payload: null,
          diagnostics: this.buildJsonDiagnostics(address, null, responseAddresses, this.emptyPayloadParseResult(), timeoutMs, transportType),
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  public async requestBuiltJson(
    request: BuiltOscWireMessage,
    options: Omit<OscJsonRequestOptions, 'payload'> = {}
  ): Promise<OscJsonResponse> {
    validateWireMessage(request.contract, request.message);
    return this.requestJson(request.message.address, {
      ...options,
      payload: extractJsonPayloadFromMessage(request.message)
    });
  }

  private buildReadCapabilityRefusal(
    address: string,
    responseAddresses: string[],
    timeoutMs: number
  ): OscJsonResponse {
    const capability = this.getRuntimeCapabilities();
    const status: Extract<StepStatus, 'unsupported_transport_mode' | 'read_capability_unconfirmed'> =
      capability.readJsonQueriesStatus === 'unsupported_transport_mode'
        ? 'unsupported_transport_mode'
        : 'read_capability_unconfirmed';
    const reason = capability.reason ?? 'Lecture JSON EOS non confirmee par le handshake/probe courant.';

    return {
      status,
      data: null,
      payload: null,
      diagnostics: this.buildJsonDiagnostics(
        address,
        null,
        responseAddresses,
        this.emptyPayloadParseResult(),
        timeoutMs,
        'unknown'
      ),
      error: `${status}: ${reason} Reconfigurez OSC pour confirmer les requetes JSON ou fournissez une source showfile explicite.`
    };
  }

  private normaliseResponseAddresses(
    requestAddress: string,
    responseAddress?: string,
    responseAddresses?: readonly string[]
  ): string[] {
    const candidates = [
      responseAddress,
      ...(responseAddresses ?? []),
      requestAddress
    ];
    return candidates.filter((candidate, index, values): candidate is string => (
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      values.indexOf(candidate) === index
    ));
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

  public async getCommandLine(options: CommandLineRequestOptions = {}): Promise<CommandLineState> {
    const requestedUser = typeof options.user === 'number' && Number.isFinite(options.user)
      ? Math.trunc(options.user)
      : null;
    const cached = this.getRememberedCommandLine(requestedUser);
    if (cached) {
      return cached;
    }

    const timeoutMs = options.timeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    const requestPayload: Record<string, unknown> = {};

    if (requestedUser !== null) {
      requestPayload.user = requestedUser;
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
        payload,
        source: 'mcp_extension_get_cmd_line'
      };
    } catch (error) {
      const timeoutError = this.asAppError(error, ErrorCode.OSC_TIMEOUT);
      if (timeoutError) {
        return {
          status: 'timeout',
          text: '',
          user: null,
          payload: null,
          source: null,
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
          source: null,
          error: connectionLostError.message
        };
      }

      throw error;
    }
  }

  private rememberCommandLineMessage(message: OscMessage): void {
    const decoded = this.decodeCommandLineOutMessage(message);
    if (!decoded) {
      return;
    }

    const state: CommandLineState = {
      status: 'ok',
      text: decoded.text,
      user: decoded.user,
      payload: message,
      source: 'official_osc_out'
    };

    this.commandLineState.set(this.commandLineStateKey(decoded.user), state);
    this.commandLineState.set(this.commandLineStateKey(null), state);
  }

  private getRememberedCommandLine(user: number | null): CommandLineState | null {
    const state = this.commandLineState.get(this.commandLineStateKey(user));
    return state ? { ...state } : null;
  }

  private commandLineStateKey(user: number | null): string {
    return user === null ? 'global' : `user:${user}`;
  }

  private decodeCommandLineOutMessage(message: OscMessage): { text: string; user: number | null } | null {
    if (message.address === COMMAND_LINE_OUT_GLOBAL) {
      const first = message.args?.[0]?.value;
      const second = message.args?.[1]?.value;
      if (typeof first === 'number' && second !== undefined) {
        return { text: String(second ?? ''), user: Math.trunc(first) };
      }
      if (typeof first === 'string' && second !== undefined) {
        const decodedUser = this.decodeUser(first);
        return decodedUser !== null
          ? { text: String(second ?? ''), user: decodedUser }
          : { text: [first, second].map((value) => String(value ?? '')).join(' '), user: null };
      }
      return { text: first == null ? '' : String(first), user: null };
    }

    const userMatch = message.address.match(COMMAND_LINE_OUT_USER_PATTERN);
    if (userMatch) {
      const first = message.args?.[0]?.value;
      return { text: first == null ? '' : String(first), user: Number.parseInt(userMatch[1] ?? '', 10) };
    }

    return null;
  }

  private async send(
    message: OscMessage,
    options: TargetOptions,
    queueOptions: SendQueueOptions = {}
  ): Promise<TransportType | null> {
    assertOscAddressStrictModeAllowed(message.address);
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

    if (options.wireContract) {
      validateWireMessage(options.wireContract, message);
    }

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
      address === USER_REQUEST ||
      address === COMMAND_LINE_GET_REQUEST
    ) {
      return 'command-line';
    }

    if (address === HANDSHAKE_REQUEST || address === PROTOCOL_SELECT_REQUEST || address === SUBSCRIBE_REQUEST) {
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
    const address = mode === 'replace' ? NEW_COMMAND_REQUEST : COMMAND_REQUEST;

    if (typeof options.user === 'number' && Number.isFinite(options.user)) {
      await this.send(
        {
          address: USER_REQUEST,
          args: [{ type: 'i', value: Math.trunc(options.user) }]
        },
        options,
        {
          operation: `la selection de l'utilisateur OSC ${USER_REQUEST}`,
          details: { user: Math.trunc(options.user) }
        }
      );
    }

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

  private async buildTimeoutConnectResult(options: ConnectOptions, errorMessage: string): Promise<ConnectResult> {
    this.lastHandshakeStatus = 'timeout';
    this.lastProtocolMode = 'degraded';
    const timeoutMs = Math.max(1, Math.min(
      options.handshakeTimeoutMs ?? this.config.handshakeTimeoutMs ?? this.config.defaultTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      this.config.defaultTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      400
    ));

    const targetOptions: TargetOptions = {
      targetConsole: options.targetConsole,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      toolId: options.toolId,
      transportPreference: options.transportPreference
    };

    let canSendCommands = false;
    let canReadQueries = false;
    const probeErrors: string[] = [];

    const ping = await this.ping({
      ...targetOptions,
      message: 'degraded-connect-probe',
      timeoutMs
    });

    if (ping.status === 'ok') {
      canSendCommands = true;

      const queryProbe = await this.getCommandLine({
        ...targetOptions,
        timeoutMs
      });
      canReadQueries = queryProbe.status === 'ok';
      if (!canReadQueries && queryProbe.error) {
        probeErrors.push(`Probe lecture: ${queryProbe.error}`);
      }
    } else if (ping.error) {
      probeErrors.push(`Probe ping: ${ping.error}`);
    }

    const handshakeMode: HandshakeMode = canSendCommands ? 'degraded' : 'timeout';
    this.setReadJsonCapability(
      canReadQueries,
      canReadQueries ? 'confirmed' : handshakeMode === 'degraded' ? 'unsupported_transport_mode' : 'read_capability_unconfirmed',
      canReadQueries ? null : [errorMessage, ...probeErrors].join(' ')
    );
    const limitations = this.buildConnectionLimitations(
      handshakeMode,
      canSendCommands,
      canReadQueries,
      'skipped',
      [errorMessage, ...probeErrors].join(' ')
    );

    return {
      status: canSendCommands ? 'ok' : 'timeout',
      version: null,
      availableProtocols: [],
      selectedProtocol: null,
      protocolStatus: 'skipped',
      handshakePayload: null,
      can_send_commands: canSendCommands,
      can_read_queries: canReadQueries,
      handshake_mode: handshakeMode,
      limitations,
      error: errorMessage
    };
  }

  private buildConnectionLimitations(
    handshakeMode: HandshakeMode,
    canSendCommands: boolean,
    canReadQueries: boolean,
    protocolStatus: StepStatus,
    detail?: string
  ): string[] {
    const limitations: string[] = [];

    if (handshakeMode === 'degraded') {
      limitations.push('Mode dégradé : envoi possible, lecture non garantie.');
      limitations.push('Handshake EOS canonique indisponible; version et protocoles non confirmés.');
    } else if (handshakeMode === 'timeout') {
      limitations.push('Handshake EOS expiré; aucune capacité OSC confirmée.');
    } else if (handshakeMode === 'legacy') {
      limitations.push('Handshake legacy détecté; les requêtes de lecture JSON ne sont pas garanties.');
    }

    if (!canSendCommands) {
      limitations.push('Envoi de commandes EOS non confirmé.');
    }

    if (!canReadQueries) {
      limitations.push('Lecture des requêtes EOS non garantie; ne pas inventer le patch, les cues ou les cuelists sans réponse de lecture explicite.');
    }

    if (protocolStatus === 'timeout') {
      limitations.push('Sélection de protocole expirée; transport OSC conservé en mode best-effort.');
    } else if (protocolStatus === 'error') {
      limitations.push('Sélection de protocole en erreur; transport OSC conservé en mode best-effort.');
    }

    if (detail && detail.trim().length > 0) {
      limitations.push(`Détail: ${detail.trim()}`);
    }

    return Array.from(new Set(limitations));
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
      const start = Date.now();
      const resendInterval = Math.min(1000, Math.max(500, Math.floor(timeout / 3)));

      let resendTimer: NodeJS.Timeout | null = null;
      let closed = false;
      let sendErrorReject: ((error: unknown) => void) | null = null;

      const stopResends = (): void => {
        if (resendTimer) {
          clearTimeout(resendTimer);
          resendTimer = null;
        }
      };

      const finalizeSuccess = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        stopResends();
        sendErrorReject = null;
      };

      const finalizeError = (): void => {
        if (closed) {
          return;
        }
        closed = true;
        stopResends();
        awaiter.cancel();
        legacyAwaiter.cancel();
        sendErrorReject = null;
      };

      const handleSendError = (error: unknown): void => {
        const reject = sendErrorReject;
        finalizeError();
        reject?.(error);
      };

      const scheduleNextSend = (): void => {
        if (closed) {
          return;
        }

        const elapsed = Date.now() - start;
        const remaining = timeout - elapsed;
        if (remaining <= 0) {
          return;
        }

        const delay = Math.min(resendInterval, remaining);
        resendTimer = setTimeout(() => {
          resendTimer = null;
          if (closed) {
            return;
          }

          void sendHandshake()
            .then(() => {
              scheduleNextSend();
            })
            .catch(() => {
              // L'erreur est geree dans handleSendError via sendHandshake.
            });
        }, delay);
      };

      const sendHandshake = async (): Promise<void> => {
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
        } catch (error) {
          handleSendError(error);
          throw error;
        }
      };

      const sendErrorPromise = new Promise<never>((_, reject) => {
        sendErrorReject = reject;
      });

      try {
        await sendHandshake();
        awaiter.startTimer();
        scheduleNextSend();

        const canonicalPromise = awaiter.promise
          .then((response) => {
            finalizeSuccess();
            legacyAwaiter.cancel();
            return this.parseHandshakeResponse(response);
          })
          .catch((error) => {
            finalizeError();
            throw error;
          });

        const legacyPromise = legacyAwaiter.promise.then((legacy) => {
          finalizeSuccess();
          awaiter.cancel();
          return legacy;
        });

        return await Promise.race([canonicalPromise, legacyPromise, sendErrorPromise]);
      } catch (error) {
        finalizeError();
        throw error;
      } finally {
        stopResends();
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
      raw: payload ?? message,
      mode: 'canonical'
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

  private parseOscPayload(message: OscMessage): OscPayloadParseResult {
    const firstArg = message.args?.[0]?.value;
    if (firstArg === undefined || firstArg === null) {
      return this.emptyPayloadParseResult();
    }

    if (typeof firstArg !== 'string') {
      return {
        type: 'json',
        data: firstArg,
        rawPayload: null,
        rawPayloadExcerpt: this.buildPayloadExcerpt(firstArg)
      };
    }

    const rawPayload = firstArg;
    const rawPayloadExcerpt = this.buildPayloadExcerpt(rawPayload);
    const trimmed = rawPayload.trim();
    if (trimmed.length === 0) {
      return this.emptyPayloadParseResult(rawPayload);
    }

    try {
      return {
        type: 'json',
        data: JSON.parse(rawPayload) as unknown,
        rawPayload,
        rawPayloadExcerpt
      };
    } catch (error) {
      const startsLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (!startsLikeJson) {
        return {
          type: 'plain_text',
          data: rawPayload,
          rawPayload,
          rawPayloadExcerpt
        };
      }

      return {
        type: 'invalid_json',
        data: rawPayload,
        rawPayload,
        rawPayloadExcerpt,
        error: error instanceof Error ? error.message : 'JSON invalide.'
      };
    }
  }

  private emptyPayloadParseResult(rawPayload: string | null = null): OscPayloadParseResult {
    return {
      type: 'empty',
      data: null,
      rawPayload,
      rawPayloadExcerpt: rawPayload ? this.buildPayloadExcerpt(rawPayload) : ''
    };
  }

  private buildJsonDiagnostics(
    requestAddress: string,
    responseAddress: string | null,
    acceptedResponseAddresses: string[],
    parsed: OscPayloadParseResult,
    timeoutMs: number,
    transportType: TransportType | 'unknown'
  ): OscJsonDiagnostics {
    return {
      requestAddress,
      responseAddress,
      acceptedResponseAddresses,
      transportType,
      timeoutMs,
      payloadType: parsed.type,
      rawPayloadExcerpt: parsed.rawPayloadExcerpt,
      handshakeStatus: this.lastHandshakeStatus,
      protocolMode: this.lastProtocolMode
    };
  }

  private buildPayloadExcerpt(payload: unknown): string {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (!raw) {
      return '';
    }

    const normalised = raw.replace(/\s+/g, ' ').trim();
    return normalised.length > 160 ? `${normalised.slice(0, 157)}...` : normalised;
  }

  private validatePayloadShape(
    parsed: OscPayloadParseResult,
    responseShape: OscJsonResponseShape,
    requireStatus: boolean
  ): string | null {
    if (parsed.type === 'invalid_json') {
      return `Payload JSON invalide: ${parsed.error}`;
    }

    if (parsed.type === 'empty') {
      return `Payload vide: ${this.describeExpectedPayload(responseShape, requireStatus)} est attendu.`;
    }

    if (responseShape === 'text') {
      if (parsed.type === 'plain_text') {
        return null;
      }
      if (parsed.type === 'json' && typeof parsed.data === 'string') {
        return null;
      }
      return 'Format de payload invalide: un texte est attendu.';
    }

    if (parsed.type === 'plain_text') {
      if (responseShape === 'scalar') {
        return null;
      }
      return `Payload texte recu: ${this.describeExpectedPayload(responseShape, requireStatus)} est attendu.`;
    }

    if (parsed.type !== 'json') {
      return `Format de payload invalide: ${this.describeExpectedPayload(responseShape, requireStatus)} est attendu.`;
    }

    if (responseShape === 'any-json') {
      return null;
    }

    if (responseShape === 'array') {
      return Array.isArray(parsed.data) ? null : 'Format de payload invalide: un tableau JSON est attendu.';
    }

    if (responseShape === 'scalar') {
      const scalarType = typeof parsed.data;
      return parsed.data === null || scalarType === 'string' || scalarType === 'number' || scalarType === 'boolean'
        ? null
        : 'Format de payload invalide: un scalaire JSON est attendu.';
    }

    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      return `Format de payload invalide: ${this.describeExpectedPayload(responseShape, requireStatus)} est attendu.`;
    }

    return null;
  }

  private describeExpectedPayload(responseShape: OscJsonResponseShape, requireStatus: boolean): string {
    if (responseShape === 'object') {
      return requireStatus ? 'un objet JSON avec un champ status' : 'un objet JSON';
    }

    if (responseShape === 'any-json') {
      return 'un payload JSON valide';
    }

    if (responseShape === 'array') {
      return 'un tableau JSON';
    }

    if (responseShape === 'scalar') {
      return 'un scalaire JSON ou texte';
    }

    return 'un texte';
  }

  private normaliseJsonStatus(payload: unknown, requireStatus: boolean): { status: StepStatus; error?: string } {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const maybeStatus = (payload as { status?: unknown }).status;
      if (typeof maybeStatus === 'string') {
        const status = this.fromStatusString(maybeStatus, true);
        if (!status) {
          return {
            status: 'error',
            error: `Statut OSC inconnu '${maybeStatus}'.`
          };
        }

        const errorMessage = status === 'error' ? this.extractErrorMessage(payload) : null;
        return {
          status,
          ...(errorMessage ? { error: errorMessage } : {})
        };
      }

      if (requireStatus) {
        return {
          status: 'error',
          error: 'Payload JSON sans champ status string.'
        };
      }
    }

    if (typeof payload === 'string') {
      const status = this.fromStatusString(payload);
      if (status) {
        return { status };
      }
    }

    return { status: requireStatus ? 'error' : 'ok', ...(requireStatus ? { error: 'Payload JSON sans statut exploitable.' } : {}) };
  }

  private withJsonDiagnostics(message: string, diagnostics: OscJsonDiagnostics): string {
    const response = diagnostics.responseAddress ?? 'aucune';
    const excerpt = diagnostics.rawPayloadExcerpt ? `, extrait='${diagnostics.rawPayloadExcerpt}'` : '';
    return `${message} (requete=${diagnostics.requestAddress}, reponse=${response}, reponses_acceptees=${diagnostics.acceptedResponseAddresses.join('|')}, payload=${diagnostics.payloadType}${excerpt})`;
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
