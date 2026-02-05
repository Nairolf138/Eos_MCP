import { resolve } from 'node:path';
import { z } from 'zod';

const DEFAULT_LOG_FILE = 'logs/mcp-server.log';
const DEFAULT_LOG_DESTINATIONS = ['file'] as const;
const DEFAULT_OSC_REMOTE_ADDRESS = '127.0.0.1';
const DEFAULT_OSC_LOCAL_ADDRESS = '0.0.0.0';
const DEFAULT_OSC_TCP_PORT = 3032;
const DEFAULT_OSC_UDP_OUT_PORT = 8001;
const DEFAULT_OSC_UDP_IN_PORT = 8000;
const DEFAULT_OSC_TCP_NO_DELAY = true;
const DEFAULT_OSC_TCP_KEEP_ALIVE_MS = 5_000;
const DEFAULT_OSC_UDP_RECV_BUFFER_SIZE = 262_144;
const DEFAULT_OSC_UDP_SEND_BUFFER_SIZE = 524_288;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_HTTP_RATE_LIMIT_MAX_REQUESTS = 60;
const DEFAULT_HTTP_MCP_TOKEN = 'change-me';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const LOG_DESTINATION_VALUES = ['stdout', 'stderr', 'file', 'transport'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFormat = 'json' | 'pretty';
export type LoggingDestinationType = (typeof LOG_DESTINATION_VALUES)[number];

export interface StdoutLoggingDestination {
  readonly type: 'stdout';
}

export interface StderrLoggingDestination {
  readonly type: 'stderr';
}

export interface FileLoggingDestination {
  readonly type: 'file';
  readonly path: string;
}

export interface TransportLoggingDestination {
  readonly type: 'transport';
  readonly target: string;
  readonly options?: Record<string, unknown>;
}

export type LoggingDestination =
  | StdoutLoggingDestination
  | StderrLoggingDestination
  | FileLoggingDestination
  | TransportLoggingDestination;

/**
 * Configuration spécifique au serveur MCP.
 */
export interface McpConfig {
  /**
   * Port TCP utilisé par le serveur MCP. Lorsque non défini, seule la communication stdio est active.
   */
  readonly tcpPort?: number;
}

/**
 * Configuration des connexions OSC sortantes et entrantes.
 */
export interface OscConfig {
  /** Adresse distante du serveur OSC. */
  readonly remoteAddress: string;
  /** Port TCP distant utilisé pour la négociation avec le serveur OSC. */
  readonly tcpPort: number;
  /** Port UDP distant utilisé pour l'envoi des messages OSC. */
  readonly udpOutPort: number;
  /** Port UDP local utilisé pour recevoir les messages OSC. */
  readonly udpInPort: number;
  /** Adresse locale à laquelle écouter pour les messages OSC entrants. */
  readonly localAddress: string;
  /** Active l'algorithme TCP_NODELAY pour réduire la latence. */
  readonly tcpNoDelay: boolean;
  /** Intervalle du keep-alive TCP (en millisecondes). */
  readonly tcpKeepAliveMs: number;
  /** Taille du buffer de réception UDP (en octets). */
  readonly udpRecvBufferSize: number;
  /** Taille du buffer d'émission UDP (en octets). */
  readonly udpSendBufferSize: number;
}

/**
 * Configuration du système de logs applicatif.
 */
export interface LoggingConfig {
  /** Niveau de log conforme aux niveaux supportés par Pino. */
  readonly level: LogLevel;
  /** Format de sortie lorsque des logs sont envoyés vers STDOUT. */
  readonly format: LogFormat;
  /** Destinations vers lesquelles les logs seront envoyés. */
  readonly destinations: readonly LoggingDestination[];
}

export interface HttpGatewaySecurityConfig {
  readonly apiKeys: readonly string[];
  readonly mcpTokens: readonly string[];
  readonly ipAllowlist: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly rateLimit: { readonly windowMs: number; readonly max: number };
}

export interface HttpGatewayConfig {
  readonly publicUrl?: string;
  readonly trustProxy: boolean;
  readonly security: HttpGatewaySecurityConfig;
}

/**
 * Configuration applicative complète, validée et normalisée.
 */
export interface AppConfig {
  readonly mcp: McpConfig;
  readonly osc: OscConfig;
  readonly logging: LoggingConfig;
  readonly httpGateway: HttpGatewayConfig;
}

interface PortSchemaOptions {
  readonly defaultValue?: number;
  readonly optional?: boolean;
}

function createPortSchema(
  variableName: string,
  options?: { defaultValue?: number; optional?: false }
): z.ZodEffects<z.ZodUnknown, number, unknown>;
function createPortSchema(
  variableName: string,
  options: { defaultValue?: number; optional: true }
): z.ZodEffects<z.ZodUnknown, number | undefined, unknown>;
function createPortSchema(
  variableName: string,
  options: PortSchemaOptions = {}
): z.ZodEffects<z.ZodUnknown, number | undefined, unknown> {
  const { defaultValue, optional = false } = options;
  const schema = z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      if (optional) {
        return undefined;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} est requise.`
      });
      return z.NEVER;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value);
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit être un entier entre 1 et 65535 (reçu: ${raw}).`
      });
      return z.NEVER;
    }

    return parsed;
  });

  if (optional) {
    return schema;
  }

  return schema as z.ZodEffects<z.ZodUnknown, number, unknown>;
}

function createAddressSchema(
  variableName: string,
  defaultValue: string
): z.ZodEffects<z.ZodUnknown, string, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    return raw;
  });
}

function createLogLevelSchema(
  variableName: string,
  defaultValue: LogLevel
): z.ZodEffects<z.ZodUnknown, LogLevel, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    const normalised = raw.toLowerCase() as LogLevel;
    if (!LOG_LEVELS.includes(normalised)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit être l'une des valeurs suivantes: ${LOG_LEVELS.join(', ')}.`
      });
      return z.NEVER;
    }

    return normalised;
  });
}

function createLogFileSchema(
  variableName: string,
  defaultValue: string
): z.ZodEffects<z.ZodUnknown, string, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return resolve(process.cwd(), defaultValue);
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    return resolve(process.cwd(), raw);
  });
}

function createLogDestinationsSchema(
  variableName: string,
  defaultValue: readonly LoggingDestinationType[]
): z.ZodEffects<z.ZodUnknown, LoggingDestinationType[], unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return [...defaultValue];
    }

    const raw = typeof value === 'string' ? value : String(value);
    const tokens = raw
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0) as LoggingDestinationType[];

    if (tokens.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit contenir au moins une destination (stdout, stderr, file, transport).`
      });
      return z.NEVER;
    }

    const invalid = tokens.filter((token) => !LOG_DESTINATION_VALUES.includes(token));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut contenir que les valeurs suivantes: ${LOG_DESTINATION_VALUES.join(', ')}.`
      });
      return z.NEVER;
    }

    return tokens;
  });
}

function createTransportTargetSchema(
  variableName: string
): z.ZodEffects<z.ZodUnknown, string | undefined, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    return raw;
  });
}

function createTransportOptionsSchema(
  variableName: string
): z.ZodEffects<z.ZodUnknown, Record<string, unknown> | undefined, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} ne peut pas être vide.`
      });
      return z.NEVER;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La variable d'environnement ${variableName} doit contenir un objet JSON.`
        });
        return z.NEVER;
      }

      return parsed as Record<string, unknown>;
    } catch (_error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit contenir un objet JSON valide.`
      });
      return z.NEVER;
    }
  });
}

function createOptionalBooleanSchema(
  variableName: string
): z.ZodEffects<z.ZodUnknown, boolean | undefined, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const raw = typeof value === 'string' ? value.trim().toLowerCase() : String(value).trim().toLowerCase();

    if (raw === 'true' || raw === '1' || raw === 'yes') {
      return true;
    }

    if (raw === 'false' || raw === '0' || raw === 'no') {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `La variable d'environnement ${variableName} doit être un booléen (true/false).`
    });
    return z.NEVER;
  });
}

function createBooleanSchema(
  variableName: string,
  defaultValue: boolean
): z.ZodEffects<z.ZodUnknown, boolean, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    const raw = typeof value === 'string' ? value.trim().toLowerCase() : String(value).trim().toLowerCase();

    if (raw === 'true' || raw === '1' || raw === 'yes') {
      return true;
    }

    if (raw === 'false' || raw === '0' || raw === 'no') {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `La variable d'environnement ${variableName} doit être un booléen (true/false).`
    });
    return z.NEVER;
  });
}

function createStringArraySchema(
  _variableName: string,
  options: { defaultValue?: readonly string[] }
): z.ZodEffects<z.ZodUnknown, string[], unknown> {
  const defaultValue = options.defaultValue ? [...options.defaultValue] : [];

  return z.unknown().transform((value, _ctx) => {
    if (value === undefined || value === null) {
      return [...defaultValue];
    }

    const raw = typeof value === 'string' ? value : String(value);
    const tokens = raw
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return [];
    }

    return tokens;
  });
}

function createOptionalHttpUrlSchema(
  variableName: string
): z.ZodEffects<z.ZodUnknown, string | undefined, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();
    if (raw.length === 0) {
      return undefined;
    }

    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La variable d'environnement ${variableName} doit utiliser le schéma http ou https.`
        });
        return z.NEVER;
      }

      const normalised = parsed.toString();
      return normalised.endsWith('/') ? normalised.slice(0, -1) : normalised;
    } catch (_error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit être une URL absolue valide.`
      });
      return z.NEVER;
    }
  });
}

function createPositiveIntegerSchema(
  variableName: string,
  defaultValue: number
): z.ZodEffects<z.ZodUnknown, number, unknown> {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    const raw = typeof value === 'string' ? value.trim() : String(value).trim();

    if (raw.length === 0) {
      return defaultValue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La variable d'environnement ${variableName} doit être un entier positif (reçu: ${raw}).`
      });
      return z.NEVER;
    }

    return parsed;
  });
}

const configSchema = z
  .object({
    nodeEnv: z
      .unknown()
      .transform((value) =>
        value === undefined || value === null ? undefined : String(value)
      ),
    logDestinationsDefined: z.boolean(),
    mcpTcpPort: createPortSchema('MCP_TCP_PORT', { optional: true }),
    oscTcpPort: createPortSchema('OSC_TCP_PORT', { defaultValue: DEFAULT_OSC_TCP_PORT }),
    oscUdpOutPort: createPortSchema('OSC_UDP_OUT_PORT', { defaultValue: DEFAULT_OSC_UDP_OUT_PORT }),
    oscUdpInPort: createPortSchema('OSC_UDP_IN_PORT', { defaultValue: DEFAULT_OSC_UDP_IN_PORT }),
    oscRemoteAddress: createAddressSchema('OSC_REMOTE_ADDRESS', DEFAULT_OSC_REMOTE_ADDRESS),
    oscLocalAddress: createAddressSchema('OSC_LOCAL_ADDRESS', DEFAULT_OSC_LOCAL_ADDRESS),
    oscTcpNoDelay: createBooleanSchema('OSC_TCP_NO_DELAY', DEFAULT_OSC_TCP_NO_DELAY),
    oscTcpKeepAliveMs: createPositiveIntegerSchema(
      'OSC_TCP_KEEP_ALIVE_MS',
      DEFAULT_OSC_TCP_KEEP_ALIVE_MS
    ),
    oscUdpRecvBufferSize: createPositiveIntegerSchema(
      'OSC_UDP_RECV_BUFFER_SIZE',
      DEFAULT_OSC_UDP_RECV_BUFFER_SIZE
    ),
    oscUdpSendBufferSize: createPositiveIntegerSchema(
      'OSC_UDP_SEND_BUFFER_SIZE',
      DEFAULT_OSC_UDP_SEND_BUFFER_SIZE
    ),
    logLevel: createLogLevelSchema('LOG_LEVEL', DEFAULT_LOG_LEVEL),
    logFilePath: createLogFileSchema('MCP_LOG_FILE', DEFAULT_LOG_FILE),
    logDestinations: createLogDestinationsSchema('LOG_DESTINATIONS', DEFAULT_LOG_DESTINATIONS),
    logTransportTarget: createTransportTargetSchema('LOG_TRANSPORT_TARGET'),
    logTransportOptions: createTransportOptionsSchema('LOG_TRANSPORT_OPTIONS'),
    logPretty: createOptionalBooleanSchema('LOG_PRETTY'),
    httpApiKeys: createStringArraySchema('MCP_HTTP_API_KEYS', { defaultValue: [] }),
    httpMcpTokens: createStringArraySchema('MCP_HTTP_MCP_TOKENS', {
      defaultValue: [DEFAULT_HTTP_MCP_TOKEN]
    }),
    httpIpAllowlist: createStringArraySchema('MCP_HTTP_IP_ALLOWLIST', { defaultValue: [] }),
    httpAllowedOrigins: createStringArraySchema('MCP_HTTP_ALLOWED_ORIGINS', { defaultValue: [] }),
    httpPublicUrl: createOptionalHttpUrlSchema('MCP_HTTP_PUBLIC_URL'),
    httpRateLimitWindowMs: createPositiveIntegerSchema(
      'MCP_HTTP_RATE_LIMIT_WINDOW',
      DEFAULT_HTTP_RATE_LIMIT_WINDOW_MS
    ),
    httpRateLimitMax: createPositiveIntegerSchema(
      'MCP_HTTP_RATE_LIMIT_MAX',
      DEFAULT_HTTP_RATE_LIMIT_MAX_REQUESTS
    ),
    httpTrustProxy: createOptionalBooleanSchema('MCP_HTTP_TRUST_PROXY')
  })
  .transform((values, ctx): AppConfig => {
    const prettyEnabled = values.logPretty ?? values.nodeEnv !== 'production';
    const destinations: LoggingDestination[] = [];
    const seen = new Set<LoggingDestinationType>();
    const destinationTypes = [...values.logDestinations];

    if (
      values.nodeEnv !== 'production' &&
      !values.logDestinationsDefined &&
      !destinationTypes.some((type) => type === 'stdout' || type === 'stderr')
    ) {
      destinationTypes.unshift('stdout');
    }

    for (const destinationType of destinationTypes) {
      const normalisedType: LoggingDestinationType =
        destinationType === 'stdout' ? 'stderr' : destinationType;

      if (seen.has(normalisedType)) {
        continue;
      }
      seen.add(normalisedType);

      if (normalisedType === 'stderr') {
        destinations.push({ type: 'stderr' });
        continue;
      }

      if (normalisedType === 'file') {
        destinations.push({ type: 'file', path: values.logFilePath });
        continue;
      }

      if (values.logTransportTarget === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'La destination "transport" requiert la variable d\'environnement LOG_TRANSPORT_TARGET.'
        });
        return z.NEVER;
      }

      destinations.push({
        type: 'transport',
        target: values.logTransportTarget,
        options: values.logTransportOptions
      });
    }

    if (destinations.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Au moins une destination de log doit être configurée.'
      });
      return z.NEVER;
    }

    return {
      mcp: {
        tcpPort: values.mcpTcpPort
      },
      osc: {
        remoteAddress: values.oscRemoteAddress,
        tcpPort: values.oscTcpPort,
        udpOutPort: values.oscUdpOutPort,
        udpInPort: values.oscUdpInPort,
        localAddress: values.oscLocalAddress,
        tcpNoDelay: values.oscTcpNoDelay,
        tcpKeepAliveMs: values.oscTcpKeepAliveMs,
        udpRecvBufferSize: values.oscUdpRecvBufferSize,
        udpSendBufferSize: values.oscUdpSendBufferSize
      },
      logging: {
        level: values.logLevel,
        format: prettyEnabled ? 'pretty' : 'json',
        destinations
      },
      httpGateway: {
        publicUrl: values.httpPublicUrl,
        trustProxy: values.httpTrustProxy ?? false,
        security: {
          apiKeys: values.httpApiKeys,
          mcpTokens: values.httpMcpTokens,
          ipAllowlist: values.httpIpAllowlist,
          allowedOrigins: values.httpAllowedOrigins,
          rateLimit: {
            windowMs: values.httpRateLimitWindowMs,
            max: values.httpRateLimitMax
          }
        }
      }
    } satisfies AppConfig;
  });

/**
 * Valide et normalise la configuration de l'application à partir des variables d'environnement.
 * @param env Variables d'environnement à valider. Utilise `process.env` par défaut.
 * @throws {Error} Lorsque une ou plusieurs variables sont invalides.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    logDestinationsDefined: env.LOG_DESTINATIONS !== undefined && env.LOG_DESTINATIONS !== null,
    mcpTcpPort: env.MCP_TCP_PORT,
    oscTcpPort: env.OSC_TCP_PORT,
    oscUdpOutPort: env.OSC_UDP_OUT_PORT,
    oscUdpInPort: env.OSC_UDP_IN_PORT,
    oscRemoteAddress: env.OSC_REMOTE_ADDRESS,
    oscLocalAddress: env.OSC_LOCAL_ADDRESS,
    oscTcpNoDelay: env.OSC_TCP_NO_DELAY,
    oscTcpKeepAliveMs: env.OSC_TCP_KEEP_ALIVE_MS,
    oscUdpRecvBufferSize: env.OSC_UDP_RECV_BUFFER_SIZE,
    oscUdpSendBufferSize: env.OSC_UDP_SEND_BUFFER_SIZE,
    logLevel: env.LOG_LEVEL,
    logFilePath: env.MCP_LOG_FILE,
    logDestinations: env.LOG_DESTINATIONS,
    logTransportTarget: env.LOG_TRANSPORT_TARGET,
    logTransportOptions: env.LOG_TRANSPORT_OPTIONS,
    logPretty: env.LOG_PRETTY,
    httpApiKeys: env.MCP_HTTP_API_KEYS,
    httpMcpTokens: env.MCP_HTTP_MCP_TOKENS,
    httpIpAllowlist: env.MCP_HTTP_IP_ALLOWLIST,
    httpAllowedOrigins: env.MCP_HTTP_ALLOWED_ORIGINS,
    httpPublicUrl: env.MCP_HTTP_PUBLIC_URL,
    httpRateLimitWindowMs: env.MCP_HTTP_RATE_LIMIT_WINDOW,
    httpRateLimitMax: env.MCP_HTTP_RATE_LIMIT_MAX,
    httpTrustProxy: env.MCP_HTTP_TRUST_PROXY
  });

  if (!result.success) {
    const message = result.error.errors.map((issue) => `- ${issue.message}`).join('\n');
    throw new Error(`Configuration invalide:\n${message}`);
  }

  return result.data;
}

let cachedConfig: AppConfig | undefined;

/**
 * Retourne la configuration applicative en la chargeant à la première
 * invocation uniquement.
 */
export function getConfig(): AppConfig {
  if (cachedConfig === undefined) {
    cachedConfig = loadConfig();
  }

  return cachedConfig;
}

/**
 * Réinitialise le cache de configuration (utilisé uniquement pour les tests).
 */
export function resetConfigCacheForTesting(): void {
  cachedConfig = undefined;
}
