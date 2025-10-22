import { resolve } from 'node:path';
import { z } from 'zod';

const DEFAULT_LOG_FILE = 'logs/mcp-server.log';
const DEFAULT_LOG_DESTINATIONS = ['file'] as const;
const DEFAULT_OSC_REMOTE_ADDRESS = '127.0.0.1';
const DEFAULT_OSC_LOCAL_ADDRESS = '0.0.0.0';
const DEFAULT_OSC_TCP_PORT = 3032;
const DEFAULT_OSC_UDP_OUT_PORT = 8001;
const DEFAULT_OSC_UDP_IN_PORT = 8000;
const DEFAULT_LOG_LEVEL = 'info';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const LOG_DESTINATION_VALUES = ['stdout', 'file', 'transport'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogFormat = 'json' | 'pretty';
export type LoggingDestinationType = (typeof LOG_DESTINATION_VALUES)[number];

export interface StdoutLoggingDestination {
  readonly type: 'stdout';
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

/**
 * Configuration applicative complète, validée et normalisée.
 */
export interface AppConfig {
  readonly mcp: McpConfig;
  readonly osc: OscConfig;
  readonly logging: LoggingConfig;
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
        message: `La variable d'environnement ${variableName} doit contenir au moins une destination (stdout, file, transport).`
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
    } catch (error) {
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

const configSchema = z
  .object({
    nodeEnv: z
      .unknown()
      .transform((value) =>
        value === undefined || value === null ? undefined : String(value)
      ),
    mcpTcpPort: createPortSchema('MCP_TCP_PORT', { optional: true }),
    oscTcpPort: createPortSchema('OSC_TCP_PORT', { defaultValue: DEFAULT_OSC_TCP_PORT }),
    oscUdpOutPort: createPortSchema('OSC_UDP_OUT_PORT', { defaultValue: DEFAULT_OSC_UDP_OUT_PORT }),
    oscUdpInPort: createPortSchema('OSC_UDP_IN_PORT', { defaultValue: DEFAULT_OSC_UDP_IN_PORT }),
    oscRemoteAddress: createAddressSchema('OSC_REMOTE_ADDRESS', DEFAULT_OSC_REMOTE_ADDRESS),
    oscLocalAddress: createAddressSchema('OSC_LOCAL_ADDRESS', DEFAULT_OSC_LOCAL_ADDRESS),
    logLevel: createLogLevelSchema('LOG_LEVEL', DEFAULT_LOG_LEVEL),
    logFilePath: createLogFileSchema('MCP_LOG_FILE', DEFAULT_LOG_FILE),
    logDestinations: createLogDestinationsSchema('LOG_DESTINATIONS', DEFAULT_LOG_DESTINATIONS),
    logTransportTarget: createTransportTargetSchema('LOG_TRANSPORT_TARGET'),
    logTransportOptions: createTransportOptionsSchema('LOG_TRANSPORT_OPTIONS'),
    logPretty: createOptionalBooleanSchema('LOG_PRETTY')
  })
  .transform((values, ctx): AppConfig => {
    const prettyEnabled = values.logPretty ?? values.nodeEnv !== 'production';
    const destinations: LoggingDestination[] = [];
    const seen = new Set<LoggingDestinationType>();

    for (const destinationType of values.logDestinations) {
      if (seen.has(destinationType)) {
        continue;
      }
      seen.add(destinationType);

      if (destinationType === 'stdout') {
        destinations.push({ type: 'stdout' });
        continue;
      }

      if (destinationType === 'file') {
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
        localAddress: values.oscLocalAddress
      },
      logging: {
        level: values.logLevel,
        format: prettyEnabled ? 'pretty' : 'json',
        destinations
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
    mcpTcpPort: env.MCP_TCP_PORT,
    oscTcpPort: env.OSC_TCP_PORT,
    oscUdpOutPort: env.OSC_UDP_OUT_PORT,
    oscUdpInPort: env.OSC_UDP_IN_PORT,
    oscRemoteAddress: env.OSC_REMOTE_ADDRESS,
    oscLocalAddress: env.OSC_LOCAL_ADDRESS,
    logLevel: env.LOG_LEVEL,
    logFilePath: env.MCP_LOG_FILE,
    logDestinations: env.LOG_DESTINATIONS,
    logTransportTarget: env.LOG_TRANSPORT_TARGET,
    logTransportOptions: env.LOG_TRANSPORT_OPTIONS,
    logPretty: env.LOG_PRETTY
  });

  if (!result.success) {
    const message = result.error.errors.map((issue) => `- ${issue.message}`).join('\n');
    throw new Error(`Configuration invalide:\n${message}`);
  }

  return result.data;
}

/**
 * Configuration applicative validée et prête à l'emploi.
 * Les valeurs sont évaluées une seule fois au chargement du module.
 */
export const config: AppConfig = loadConfig();
