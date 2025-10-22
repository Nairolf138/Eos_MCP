import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from '../config/index';
import { createOscGatewayFromEnv, OscConnectionGateway } from '../services/osc/index';
import { initializeOscClient } from '../services/osc/client';
import { ErrorCode, describeError, toAppError } from './errors';
import { createLogger } from './logger';
import { toolDefinitions } from '../tools/index';
import { registerToolSchemas } from '../schemas/index';
import type { ToolDefinition } from '../tools/types';
import { createHttpGateway, type HttpGateway } from './httpGateway';
import { ToolRegistry } from './toolRegistry';
import { getPackageVersion } from '../utils/version';

const logger = createLogger('mcp-server');

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

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    const appError = toAppError(error, {
      code: ErrorCode.MCP_STARTUP_FAILURE,
      message: 'Erreur lors du demarrage du serveur MCP.'
    });
    logger.fatal({ error: describeError(appError) }, appError.message);
    process.exit(1);
  });
}

export { bootstrap, ToolRegistry };
