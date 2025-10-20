import { resolve } from 'node:path';
import { z } from 'zod';

const DEFAULT_LOG_FILE = 'logs/mcp-server.log';
const DEFAULT_OSC_REMOTE_ADDRESS = '127.0.0.1';
const DEFAULT_OSC_LOCAL_ADDRESS = '0.0.0.0';
const DEFAULT_OSC_TCP_PORT = 3032;
const DEFAULT_OSC_UDP_OUT_PORT = 8001;
const DEFAULT_OSC_UDP_IN_PORT = 8000;
const DEFAULT_LOG_LEVEL = 'info';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

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
  /** Chemin absolu du fichier de log MCP. */
  readonly filePath: string;
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
  { defaultValue, optional = false }: PortSchemaOptions
): z.ZodEffects<z.ZodUnknown, number | undefined, unknown> {
  return z.unknown().transform((value, ctx) => {
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

const configSchema = z
  .object({
    mcpTcpPort: createPortSchema('MCP_TCP_PORT', { optional: true }),
    oscTcpPort: createPortSchema('OSC_TCP_PORT', { defaultValue: DEFAULT_OSC_TCP_PORT }),
    oscUdpOutPort: createPortSchema('OSC_UDP_OUT_PORT', { defaultValue: DEFAULT_OSC_UDP_OUT_PORT }),
    oscUdpInPort: createPortSchema('OSC_UDP_IN_PORT', { defaultValue: DEFAULT_OSC_UDP_IN_PORT }),
    oscRemoteAddress: createAddressSchema('OSC_REMOTE_ADDRESS', DEFAULT_OSC_REMOTE_ADDRESS),
    oscLocalAddress: createAddressSchema('OSC_LOCAL_ADDRESS', DEFAULT_OSC_LOCAL_ADDRESS),
    logLevel: createLogLevelSchema('LOG_LEVEL', DEFAULT_LOG_LEVEL),
    logFilePath: createLogFileSchema('MCP_LOG_FILE', DEFAULT_LOG_FILE)
  })
  .transform((values): AppConfig => ({
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
      filePath: values.logFilePath
    }
  } satisfies AppConfig));

/**
 * Valide et normalise la configuration de l'application à partir des variables d'environnement.
 * @param env Variables d'environnement à valider. Utilise `process.env` par défaut.
 * @throws {Error} Lorsque une ou plusieurs variables sont invalides.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = configSchema.safeParse({
    mcpTcpPort: env.MCP_TCP_PORT,
    oscTcpPort: env.OSC_TCP_PORT,
    oscUdpOutPort: env.OSC_UDP_OUT_PORT,
    oscUdpInPort: env.OSC_UDP_IN_PORT,
    oscRemoteAddress: env.OSC_REMOTE_ADDRESS,
    oscLocalAddress: env.OSC_LOCAL_ADDRESS,
    logLevel: env.LOG_LEVEL,
    logFilePath: env.MCP_LOG_FILE
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
