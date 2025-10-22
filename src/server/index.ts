import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getConfig, type AppConfig } from '../config/index';
import { createOscGatewayFromEnv, OscConnectionGateway } from '../services/osc/index';
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

interface CliOptions {
  help: boolean;
  version: boolean;
  listTools: boolean;
  checkConfig: boolean;
  unknown: string[];
}

function parseCliArguments(argv: readonly string[]): CliOptions {
  const options = {
    help: false,
    version: false,
    listTools: false,
    checkConfig: false,
    unknown: [] as string[]
  } satisfies CliOptions;

  for (const token of argv) {
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

    if (token === '--') {
      break;
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
    '  --check-config      Valide la configuration et quitte.';

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
  gateway?: HttpGateway;
}

async function bootstrap(): Promise<BootstrapContext> {
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

  initialiseLogger(config);

  const tcpPort = config.mcp.tcpPort;
  const oscGateway = createOscGatewayFromEnv({ logger: createLogger('osc-gateway') });
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
  const connections: Array<Promise<void>> = [server.connect(transport)];

  let gateway: HttpGateway | undefined;
  if (tcpPort) {
    gateway = createHttpGateway(registry, { port: tcpPort });
    connections.push(gateway.start());
  }

  await Promise.all(connections);

  const toolCount = registry.listTools().length;
  const httpAddress = gateway?.getAddress();

  if (httpAddress) {
    logger.info(
      {
        toolCount,
        httpGateway: {
          address: httpAddress.address,
          family: httpAddress.family,
          port: httpAddress.port
        },
        stdioTransport: 'listening'
      },
      `Serveur MCP demarre : ${toolCount} outil(s) disponibles. Passerelle HTTP/WS active sur le port ${httpAddress.port}. Transport STDIO en ecoute.`
    );
  } else {
    logger.info(
      {
        toolCount,
        httpGateway: 'inactive',
        stdioTransport: 'listening'
      },
      `Serveur MCP demarre : ${toolCount} outil(s) disponibles. Communication STDIO uniquement (aucune passerelle HTTP/WS active).`
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

    logger.info('Arret du serveur MCP termine.');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void handleShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void handleShutdown('SIGTERM');
  });

  return { server, registry, oscGateway, gateway };
}

async function runFromCommandLine(argv: NodeJS.Process['argv']): Promise<void> {
  const [, script = 'src/server/index.js'] = argv;
  const options = parseCliArguments(argv.slice(2));

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

  await bootstrap();
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

export { bootstrap, ToolRegistry };
