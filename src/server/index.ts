import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig, type AppConfig } from '../config/index';
import {
  createOscGatewayFromEnv,
  OscConnectionGateway,
  OscConnectionStateProvider
} from '../services/osc/index';
import { initializeOscClient } from '../services/osc/client';
import { ErrorCode, describeError, toAppError } from './errors';
import { createLogger, initialiseLogger } from './logger';
import { toolDefinitions } from '../tools/index';
import { registerToolSchemas } from '../schemas/index';
import type { ToolDefinition } from '../tools/types';
import { createHttpGateway, type HttpGateway } from './httpGateway';
import { ToolRegistry } from './toolRegistry';
import { getPackageVersion } from '../utils/version';

const logger = createLogger('mcp-server');

const TLS_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);

function isTlsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const candidate = env.MCP_TLS_ENABLED ?? env.MCP_TLS ?? env.MCP_USE_TLS;
  if (candidate === undefined) {
    return false;
  }

  const normalised = String(candidate).trim().toLowerCase();
  return TLS_TRUE_VALUES.has(normalised);
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
  const options = {
    help: false,
    version: false,
    listTools: false,
    checkConfig: false,
    verbose: false,
    jsonLogs: false,
    statsIntervalMs: undefined,
    unknown: [] as string[],
    errors: [] as string[]
  } satisfies CliOptions;

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

  initialiseLogger(effectiveConfig);

  const tcpPort = effectiveConfig.mcp.tcpPort;
  const oscConnectionState = new OscConnectionStateProvider();
  const oscGateway = createOscGatewayFromEnv({
    logger: createLogger('osc-gateway'),
    connectionStateProvider: oscConnectionState
  });

  if (options.enableVerboseOscLogging) {
    oscGateway.setLoggingOptions({ incoming: true, outgoing: true });
  }

  initializeOscClient(oscGateway);

  const server = new McpServer({
    name: 'eos-mcp-server',
    version: getPackageVersion()
  });

  if (tcpPort) {
    logger.info({ tcpPort }, `Passerelle HTTP/WS MCP activee sur ${tcpPort}`);
  } else {
    logger.info('Passerelle HTTP/WS MCP desactivee (MCP_TCP_PORT non defini).');
  }

  const registry = new ToolRegistry(server);
  registerToolSchemas(server);
  const tools = await loadToolDefinitions();
  registry.registerMany(tools);

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
      oscConnectionProvider: oscConnectionState,
      security: effectiveConfig.httpGateway.security,
      oscGateway,
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
        const diagnostics = oscGateway.getDiagnostics();
        logger.info(
          {
            osc: {
              stats: diagnostics.stats,
              uptimeMs: diagnostics.uptimeMs,
              startedAt: diagnostics.startedAt
            }
          },
          'Statistiques OSC'
        );
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
      oscGateway.close();
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
      getConfig();
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
    statsIntervalMs: options.statsIntervalMs
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

export { bootstrap, ToolRegistry, parseCliArguments, applyBootstrapOverrides };
