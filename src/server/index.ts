import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createOscServiceFromEnv, OscService } from '../services/osc/index.js';
import { initializeOscClient } from '../services/osc/client.js';
import { ErrorCode, describeError, toAppError } from './errors.js';
import { createLogger } from './logger.js';
import { toolDefinitions } from '../tools/index.js';
import { registerToolSchemas } from '../schemas/index.js';
import type { ToolDefinition } from '../tools/types.js';
import { createHttpGateway, type HttpGateway } from './httpGateway.js';
import { ToolRegistry } from './toolRegistry.js';

const logger = createLogger('mcp-server');

async function loadToolDefinitions(): Promise<ToolDefinition[]> {
  return toolDefinitions;
}

interface BootstrapContext {
  server: McpServer;
  registry: ToolRegistry;
  oscService: OscService;
  gateway?: HttpGateway;
}

async function bootstrap(): Promise<BootstrapContext> {
  const tcpPortEnv = process.env.MCP_TCP_PORT;
  const tcpPort = tcpPortEnv ? Number.parseInt(tcpPortEnv, 10) : undefined;
  if (tcpPortEnv && Number.isNaN(tcpPort)) {
    throw new Error(`La variable d'environnement MCP_TCP_PORT est invalide: ${tcpPortEnv}`);
  }
  const oscService = createOscServiceFromEnv(createLogger('osc-service'));
  initializeOscClient(oscService);

  const server = new McpServer({
    name: 'eos-mcp-server',
    version: '0.1.0'
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
      oscService.close();
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

  return { server, registry, oscService, gateway };
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
