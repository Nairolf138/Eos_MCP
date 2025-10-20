import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOscServiceFromEnv, OscService } from '../services/osc/index.js';
import { initializeOscClient } from '../services/osc/client.js';
import { ErrorCode, describeError, toAppError } from './errors.js';
import { createLogger } from './logger.js';
import { toolDefinitions } from '../tools/index.js';
import { registerToolSchemas } from '../schemas/index.js';
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolMiddleware,
  ToolContext
} from '../tools/types.js';

const logger = createLogger('mcp-server');

class ToolRegistry {
  private readonly registeredTools = new Map<string, ToolDefinition>();

  constructor(private readonly server: McpServer) {}

  public register(tool: ToolDefinition): void {
    const callback = this.attachMiddlewares(tool) as ToolCallback;
    this.server.registerTool(tool.name, tool.config as never, callback as never);
    this.registeredTools.set(tool.name, tool);
  }

  public registerMany(tools: ToolDefinition[]): void {
    tools.forEach((tool) => this.register(tool));
    this.server.sendToolListChanged();
  }

  private attachMiddlewares(tool: ToolDefinition): ToolCallback {
    const middlewares = tool.middlewares ?? [];
    if (middlewares.length === 0) {
      return tool.handler as ToolCallback;
    }

    return (async (args: unknown, extra: unknown) => {
      const context: ToolContext = { name: tool.name, args, extra };

      const executeHandler = (): Promise<ToolExecutionResult> =>
        Promise.resolve(tool.handler(args as never, extra as never));

      return this.compose(middlewares, executeHandler)(context);
    }) as ToolCallback;
  }

  private compose(
    middlewares: ToolMiddleware[],
    handler: () => Promise<ToolExecutionResult>
  ): ((context: ToolContext) => Promise<ToolExecutionResult>) {
    return async (context: ToolContext): Promise<ToolExecutionResult> => {
      let index = -1;
      const dispatch = async (i: number): Promise<ToolExecutionResult> => {
        if (i <= index) {
          throw new Error('Le middleware a appele next() plusieurs fois');
        }
        index = i;
        const middleware = middlewares[i];
        if (!middleware) {
          return handler();
        }
        return middleware(context, () => dispatch(i + 1));
      };

      return dispatch(0);
    };
  }
}

async function loadToolDefinitions(): Promise<ToolDefinition[]> {
  return toolDefinitions;
}

interface BootstrapContext {
  server: McpServer;
  registry: ToolRegistry;
  oscService: OscService;
}

async function bootstrap(): Promise<BootstrapContext> {
  const tcpPort = Number.parseInt(process.env.MCP_TCP_PORT ?? '3032', 10);
  const oscService = createOscServiceFromEnv(createLogger('osc-service'));
  initializeOscClient(oscService);

  const server = new McpServer({
    name: 'eos-mcp-server',
    version: '0.1.0'
  });

  logger.info({ tcpPort }, `Port TCP MCP reserve sur ${tcpPort}`);

  const registry = new ToolRegistry(server);
  registerToolSchemas(server);
  const tools = await loadToolDefinitions();
  registry.registerMany(tools);

  const transport = new StdioServerTransport();
  await server.connect(transport);

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

  return { server, registry, oscService };
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
