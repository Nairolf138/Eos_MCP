import { initialiseEnv } from '../config/env';

initialiseEnv();

import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig, type AppConfig } from '../config/index';
import {
  createOscGatewayFromEnv,
  OscConnectionGateway,
  OscConnectionStateProvider
} from '../services/osc/index';
import {
  getOscClient,
  getOscGateway,
  initializeOscClient,
  onOscGatewayChange
} from '../services/osc/client';
import { ErrorCode, describeError, isAppError, toAppError } from './errors';
import { createLogger, initialiseLogger } from './logger';
import { toolDefinitions } from '../tools/index';
import { registerToolSchemas } from '../schemas/index';
import type { ToolDefinition } from '../tools/types';
import { createHttpGateway, type HttpGateway } from './httpGateway';
import { ToolRegistry } from './toolRegistry';
import { getPackageVersion } from '../utils/version';
import { assertTcpPortAvailable, assertUdpPortAvailable } from './startupChecks';

const logger = createLogger('mcp-server');

const TRUE_FLAG_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);

function isTruthyFlag(candidate: unknown): boolean {
  if (candidate === undefined) {
    return false;
  }

  const normalised = String(candidate).trim().toLowerCase();
  return TRUE_FLAG_VALUES.has(normalised);
}

function isTlsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidate = env.MCP_TLS_ENABLED ?? env.MCP_TLS ?? env.MCP_USE_TLS;
  return isTruthyFlag(candidate);
}

export function buildHttpAccessDetails(
  httpAddress: AddressInfo,
  env: NodeJS.ProcessEnv = process.env
): { host: string; protocol: 'http' | 'https'; accessUrl: string } {
  const rawHost = httpAddress.address;
  const family = httpAddress.family;

  let host: string;
  if (rawHost === '0.0.0.0' || rawHost === '::') {
    host = 'localhost';
  } else if (family === 'IPv6' && !rawHost.startsWith('[') && rawHost !== 'localhost') {
    host = `[${rawHost}]`;
  } else {
    host = rawHost;
  }

  const protocol: 'http' | 'https' = isTlsEnabled(env) ? 'https' : 'http';
  const accessUrl = `${protocol}://${host}:${httpAddress.port}`;

  return { host, protocol, accessUrl };
}

interface CliOptions {
  help: boolean;
  version: boolean;
  listTools: boolean;
  checkConfig: boolean;
  verbose: boolean;
  jsonLogs: boolean;
  statsIntervalMs?: number;
  skipOscCheck: boolean;
  unknown: string[];
  errors: string[];
}

function parseStatsIntervalValue(rawValue: string): number | null {
  const value = rawValue.trim().toLowerCase();
  if (value.length === 0) {
    return null;
  }

  let multiplier = 1000;
  let numericPortion = value;

  if (value.endsWith('ms')) {
    multiplier = 1;
    numericPortion = value.slice(0, -2);
  } else if (value.endsWith('s')) {
    multiplier = 1000;
    numericPortion = value.slice(0, -1);
  }

  const parsed = Number.parseFloat(numericPortion);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * multiplier);
}

function parseCliArguments(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    version: false,
    listTools: false,
    checkConfig: false,
    verbose: false,
    jsonLogs: false,
    statsIntervalMs: undefined,
    skipOscCheck: false,
    unknown: [] as string[],
    errors: [] as string[]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;

    if (token === '--') {
      break;
    }

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--version' || token === '-v') {
      options.version = true;
      continue;
    }

    if (token === '--list-tools') {
      options.listTools = true;
      continue;
    }

    if (token === '--check-config') {
      options.checkConfig = true;
      continue;
    }

    if (token === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (token === '--json-logs') {
      options.jsonLogs = true;
      continue;
    }

    if (token === '--skip-osc-check') {
      options.skipOscCheck = true;
      continue;
    }

    if (token.startsWith('--stats-interval=')) {
      const [, raw] = token.split('=', 2);
      const interval = raw ? parseStatsIntervalValue(raw) : null;
      if (interval === null) {
        options.errors.push(
          "La valeur fournie pour --stats-interval doit être un nombre positif (ex: 10s, 5000ms)."
        );
      } else {
        options.statsIntervalMs = interval;
      }
      continue;
    }

    if (token === '--stats-interval') {
      const next = argv[index + 1];
      if (!next || next.startsWith('-')) {
        options.errors.push("L'option --stats-interval nécessite une valeur (ex: --stats-interval 15s).");
        continue;
      }

      const interval = parseStatsIntervalValue(next);
      if (interval === null) {
        options.errors.push(
          "La valeur fournie pour --stats-interval doit être un nombre positif (ex: 10s, 5000ms)."
        );
      } else {
        options.statsIntervalMs = interval;
      }
      index += 1;
      continue;
    }

    options.unknown.push(token);
  }

  return options;
}

function printHelp(scriptName: string): void {
  const usage = `Usage : node ${scriptName} [options]\n\n` +
    'Options :\n' +
    '  --help, -h          Affiche cette aide et quitte.\n' +
    '  --version, -v       Affiche la version du serveur et quitte.\n' +
    '  --list-tools        Liste les outils MCP disponibles et quitte.\n' +
    '  --check-config      Valide la configuration et quitte.\n' +
    '  --verbose           Active le log détaillé des messages OSC.\n' +
    '  --json-logs         Force une sortie JSON sur STDOUT pour les logs.\n' +
    '  --skip-osc-check    Ignore le handshake OSC de démarrage (développement/test).\n' +
    '  --stats-interval X  Publie périodiquement les compteurs OSC (ex: 30s, 5s, 10000ms).';

  console.log(usage);
}

async function printToolList(): Promise<void> {
  const tools = await loadToolDefinitions();
  console.log(`Outils MCP disponibles (${tools.length}) :`);
  for (const tool of tools) {
    const title = tool.config.title ?? tool.name;
    const description = tool.config.description ? ` — ${tool.config.description}` : '';
    console.log(`- ${tool.name} (${title})${description}`);
  }
}

async function loadToolDefinitions(): Promise<ToolDefinition[]> {
  return toolDefinitions;
}

interface BootstrapContext {
  server: McpServer;
  registry: ToolRegistry;
  oscGateway: OscConnectionGateway;
  oscConnectionState: OscConnectionStateProvider;
  gateway?: HttpGateway;
}

interface BootstrapOptions {
  readonly forceJsonLogs?: boolean;
  readonly enableVerboseOscLogging?: boolean;
  readonly statsIntervalMs?: number;
  readonly skipOscHandshake?: boolean;
}

type McpTokenValidationResult =
  | { status: 'ok' }
  | { status: 'warn' | 'error'; message: string };

const DEFAULT_MCP_HTTP_TOKEN_PLACEHOLDER = 'change-me';

function validateMcpTokenConfiguration(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env
): McpTokenValidationResult {
  const tcpPort = config.mcp.tcpPort;
  if (tcpPort === undefined || tcpPort === null) {
    return { status: 'ok' };
  }

  const rawTokens = config.httpGateway.security.mcpTokens ?? [];
  const tokens = rawTokens.map((token) => token.trim()).filter((token) => token.length > 0);

  const hasNoTokens = tokens.length === 0;
  const onlyPlaceholderTokens =
    tokens.length > 0 && tokens.every((token) => token === DEFAULT_MCP_HTTP_TOKEN_PLACEHOLDER);

  if (!hasNoTokens && !onlyPlaceholderTokens) {
    return { status: 'ok' };
  }

  const message =
    'Passerelle HTTP/WS MCP activee mais aucun jeton MCP securise n\'est defini (valeur par defaut "change-me"). ' +
    'Definissez MCP_HTTP_MCP_TOKENS avec au moins une valeur robuste avant d\'exposer le service.';
  const nodeEnv = env.NODE_ENV ?? '';
  const status: 'warn' | 'error' = nodeEnv === 'production' ? 'error' : 'warn';

  return { status, message };
}

interface StdioStatusSnapshot {
  status: 'starting' | 'listening' | 'stopped';
  clients: number;
  startedAt?: number;
}

function applyBootstrapOverrides(
  config: AppConfig,
  options: BootstrapOptions
): AppConfig {
  if (!options.forceJsonLogs) {
    return config;
  }

  return {
    ...config,
    logging: {
      ...config.logging,
      format: 'json',
      destinations: [{ type: 'stdout' }]
    }
  } satisfies AppConfig;
}

async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapContext> {
  let config: AppConfig;
  try {
    config = getConfig();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Impossible de charger la configuration: ${reason}`;
    logger.fatal(message);
    process.exit(1);
    throw new Error(message);
  }

  const effectiveConfig = applyBootstrapOverrides(config, options);

  const tokenValidation = validateMcpTokenConfiguration(effectiveConfig);
  if (tokenValidation.status !== 'ok') {
    const { message } = tokenValidation;

    if (tokenValidation.status === 'error') {
      logger.error(message);
      process.exit(1);
      throw new Error(message);
    }

    logger.warn(message);
  }

  try {
    const mcpTcpPort = effectiveConfig.mcp.tcpPort;
    if (mcpTcpPort !== undefined && mcpTcpPort !== null) {
      await assertTcpPortAvailable(mcpTcpPort);
    }

    await assertUdpPortAvailable(effectiveConfig.osc.udpInPort);
  } catch (error) {
    const appError = isAppError(error)
      ? error
      : toAppError(error, { code: ErrorCode.MCP_STARTUP_FAILURE });

    const details = appError.details ?? {};
    const port = typeof details.port === 'number' ? details.port : undefined;
    const protocol =
      typeof details.protocol === 'string' ? String(details.protocol).toUpperCase() : undefined;

    const context: Record<string, unknown> = {
      error: describeError(appError)
    };

    if (port !== undefined) {
      context.port = port;
    }

    if (protocol !== undefined) {
      context.protocol = protocol;
    }

    const location = protocol && port !== undefined
      ? `${protocol} ${port}`
      : port !== undefined
        ? `port ${port}`
        : 'port reseau';
    logger.fatal(context, `Impossible de reserver le ${location}: ${appError.message}`);
    process.exit(1);
    throw appError;
  }

  initialiseLogger(effectiveConfig);

  const tcpPort = effectiveConfig.mcp.tcpPort;
  const securityOptions: NonNullable<
    Parameters<typeof createHttpGateway>[1]['security']
  > = {
    apiKeys: Array.from(effectiveConfig.httpGateway.security.apiKeys),
    mcpTokens: Array.from(effectiveConfig.httpGateway.security.mcpTokens),
    ipAllowlist: Array.from(effectiveConfig.httpGateway.security.ipAllowlist),
    allowedOrigins: Array.from(effectiveConfig.httpGateway.security.allowedOrigins),
    rateLimit: {
      windowMs: effectiveConfig.httpGateway.security.rateLimit.windowMs,
      max: effectiveConfig.httpGateway.security.rateLimit.max
    }
  };
  const oscConnectionState = new OscConnectionStateProvider();
  const oscGateway = createOscGatewayFromEnv({
    logger: createLogger('osc-gateway'),
    connectionStateProvider: oscConnectionState
  });

  if (options.enableVerboseOscLogging) {
    oscGateway.setLoggingOptions({ incoming: true, outgoing: true });
  }

  initializeOscClient(oscGateway);

  let currentOscGateway = getOscGateway();
  const unsubscribeGatewayObserver = onOscGatewayChange((nextGateway) => {
    currentOscGateway = nextGateway;
  });

  const skipHandshakeFromEnv = isTruthyFlag(process.env.MCP_SKIP_OSC_HANDSHAKE);
  const skipHandshakeFromOptions = Boolean(options.skipOscHandshake);
  const shouldSkipHandshake = skipHandshakeFromEnv || skipHandshakeFromOptions;

  if (shouldSkipHandshake) {
    const reason = skipHandshakeFromOptions ? 'option-cli' : 'variable-env';
    logger.warn(
      { reason },
      'Verification initiale de la connexion OSC ignoree (utilisation reservee au developpement/tests).'
    );
  } else {
    const client = getOscClient();
    try {
      const handshakeResult = await client.connect({
        toolId: 'startup_preflight',
        handshakeTimeoutMs: 10000,
        protocolTimeoutMs: 10000
      });

      if (handshakeResult.status === 'timeout' || handshakeResult.status === 'error') {
        const message =
          handshakeResult.status === 'timeout'
            ? "Echec du handshake OSC: delai d'attente depasse."
            : "Echec du handshake OSC: erreur de connexion.";
        const appError = toAppError(new Error(message), {
          code: ErrorCode.MCP_STARTUP_FAILURE,
          message,
          details: {
            status: handshakeResult.status,
            error: handshakeResult.error ?? null
          }
        });
        logger.fatal({ error: describeError(appError) }, message);
        throw appError;
      }

      logger.info(
        {
          osc: {
            status: handshakeResult.status,
            version: handshakeResult.version,
            selectedProtocol: handshakeResult.selectedProtocol,
            availableProtocols: handshakeResult.availableProtocols
          }
        },
        'Connexion OSC initiale etablie.'
      );
    } catch (error) {
      const appError = toAppError(error, {
        code: ErrorCode.MCP_STARTUP_FAILURE,
        message: 'Impossible de finaliser le handshake OSC de demarrage.'
      });
      logger.fatal({ error: describeError(appError) }, appError.message);
      throw appError;
    }
  }

  const serverInfo = {
    name: 'eos-mcp-server',
    version: getPackageVersion()
  } as const;

  const tools = await loadToolDefinitions();

  const registerToolsOnServer = (target: McpServer): ToolRegistry => {
    const toolRegistry = new ToolRegistry(target);
    toolRegistry.registerMany(tools);
    return toolRegistry;
  };

  const createConfiguredServer = (): { server: McpServer; registry: ToolRegistry } => {
    const instance = new McpServer(serverInfo);
    registerToolSchemas(instance);
    const instanceRegistry = registerToolsOnServer(instance);
    return { server: instance, registry: instanceRegistry };
  };

  const { server, registry } = createConfiguredServer();

  if (tcpPort) {
    logger.info({ tcpPort }, `Passerelle HTTP/WS MCP activee sur ${tcpPort}`);
  } else {
    logger.info('Passerelle HTTP/WS MCP desactivee (MCP_TCP_PORT non defini).');
  }

  const transport = new StdioServerTransport();
  const stdioStatus: StdioStatusSnapshot = {
    status: 'starting',
    clients: 0
  };
  const connections: Array<Promise<void>> = [
    server
      .connect(transport)
      .then(() => {
        stdioStatus.status = 'listening';
        stdioStatus.clients = 1;
        stdioStatus.startedAt = Date.now();
      })
      .catch((error) => {
        stdioStatus.status = 'stopped';
        stdioStatus.clients = 0;
        throw error;
      })
  ];

  let gateway: HttpGateway | undefined;
  if (tcpPort) {
    gateway = createHttpGateway(registry, {
      port: tcpPort,
      publicUrl: effectiveConfig.httpGateway.publicUrl,
      trustProxy: effectiveConfig.httpGateway.trustProxy,
      serverFactory: () => createConfiguredServer().server,
      oscConnectionProvider: oscConnectionState,
      security: securityOptions,
      oscGateway: {
        getDiagnostics: () => {
          const diagnostics = currentOscGateway.getDiagnostics?.();
          if (!diagnostics) {
            throw new Error('Diagnostics OSC indisponibles');
          }
          return diagnostics;
        }
      },
      stdioStatusProvider: () => ({ ...stdioStatus })
    });
    connections.push(gateway.start());
  }

  await Promise.all(connections);

  let statsReporter: NodeJS.Timeout | undefined;
  if (options.statsIntervalMs && options.statsIntervalMs > 0) {
    const intervalMs = options.statsIntervalMs;
    logger.info(
      { intervalMs },
      'Reporting periodique des statistiques OSC active'
    );
    statsReporter = setInterval(() => {
      try {
        const diagnostics = currentOscGateway.getDiagnostics?.();
        if (!diagnostics) {
          throw new Error('Diagnostics OSC indisponibles');
        }
        logger.info({
          osc: {
            stats: diagnostics.stats,
            uptimeMs: diagnostics.uptimeMs,
            startedAt: diagnostics.startedAt
          }
        }, 'Statistiques OSC');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ error: err }, 'Impossible de recuperer les diagnostics OSC');
      }
    }, intervalMs);
    if (typeof statsReporter.unref === 'function') {
      statsReporter.unref();
    }
  }

  const toolCount = registry.listTools().length;
  const httpAddress = gateway?.getAddress();

  if (httpAddress) {
    const { accessUrl, host, protocol } = buildHttpAccessDetails(httpAddress);

    logger.info(
      {
        toolCount,
        httpGateway: {
          address: httpAddress.address,
          family: httpAddress.family,
          host,
          port: httpAddress.port,
          protocol
        },
        accessUrl,
        stdioTransport: 'listening'
      },
      `Serveur MCP demarre : ${toolCount} outil(s) disponibles. Accessible sur ${accessUrl} (Passerelle HTTP/WS active). Transport STDIO en ecoute.`
    );
  } else {
    logger.info(
      {
        toolCount,
        httpGateway: 'inactive',
        stdioTransport: 'listening'
      },
      `Serveur MCP demarre : ${toolCount} outil(s) disponibles. Mode STDIO uniquement : la passerelle HTTP/WS est desactivee.`
    );
  }

  const handleShutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'Signal %s recu, fermeture du serveur MCP', signal);
    try {
      await server.close();
    } catch (error) {
      const appError = toAppError(error, {
        code: ErrorCode.MCP_STARTUP_FAILURE,
        message: `Erreur lors de la fermeture du serveur MCP apres ${signal}`
      });
      logger.error({ error: describeError(appError) }, appError.message);
    }

    if (gateway) {
      try {
        await gateway.stop();
      } catch (error) {
        const appError = toAppError(error, {
          code: ErrorCode.MCP_STARTUP_FAILURE,
          message: `Erreur lors de la fermeture de la passerelle HTTP apres ${signal}`
        });
        logger.error({ error: describeError(appError) }, appError.message);
      }
    }

    try {
      currentOscGateway.close?.();
    } catch (error) {
      const appError = toAppError(error, {
        code: ErrorCode.MCP_STARTUP_FAILURE,
        message: `Erreur lors de la fermeture du service OSC apres ${signal}`
      });
      logger.error({ error: describeError(appError) }, appError.message);
    }

    if (statsReporter) {
      clearInterval(statsReporter);
    }

    unsubscribeGatewayObserver();

    stdioStatus.status = 'stopped';
    stdioStatus.clients = 0;

    logger.info('Arret du serveur MCP termine.');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });

  return { server, registry, oscGateway, gateway, oscConnectionState };
}

async function runFromCommandLine(argv: NodeJS.Process['argv']): Promise<void> {
  const [, script = 'src/server/index.js'] = argv;
  const options = parseCliArguments(argv.slice(2));

  if (options.errors.length > 0) {
    for (const message of options.errors) {
      console.error(message);
    }
    process.exit(1);
    return;
  }

  if (options.unknown.length > 0) {
    console.error(`Option(s) inconnue(s) : ${options.unknown.join(', ')}`);
    console.error('Utilisez --help pour afficher l\'aide.');
    process.exit(1);
    return;
  }

  if (options.help) {
    printHelp(script);
    process.exit(0);
    return;
  }

  if (options.version) {
    const version = getPackageVersion();
    console.log(`Eos MCP ${version}`);
    process.exit(0);
    return;
  }

  if (options.listTools) {
    await printToolList();
    process.exit(0);
    return;
  }

  if (options.checkConfig) {
    try {
      const config = getConfig();
      const effectiveConfig = applyBootstrapOverrides(config, {});
      const validation = validateMcpTokenConfiguration(effectiveConfig);
      if (validation.status === 'error') {
        console.error('Configuration invalide :');
        console.error(validation.message);
        process.exit(1);
        return;
      }

      if (validation.status === 'warn') {
        console.warn(validation.message);
      }

      console.log('Configuration valide.');
      process.exit(0);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Configuration invalide :');
      console.error(reason);
      process.exit(1);
    }
    return;
  }

  await bootstrap({
    forceJsonLogs: options.jsonLogs,
    enableVerboseOscLogging: options.verbose,
    statsIntervalMs: options.statsIntervalMs,
    skipOscHandshake: options.skipOscCheck
  });
}

if (require.main === module) {
  void runFromCommandLine(process.argv).catch((error: unknown) => {
    const appError = toAppError(error, {
      code: ErrorCode.MCP_STARTUP_FAILURE,
      message: 'Erreur lors du demarrage du serveur MCP.'
    });
    logger.fatal({ error: describeError(appError) }, appError.message);
    process.exit(1);
  });
}

export {
  bootstrap,
  ToolRegistry,
  parseCliArguments,
  applyBootstrapOverrides,
  validateMcpTokenConfiguration
};
