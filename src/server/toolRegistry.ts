import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolMiddleware,
  ToolContext
} from '../tools/types.js';

class ToolNotFoundError extends Error {
  constructor(toolName: string, available: string[]) {
    const hint =
      available.length > 0
        ? `Outils disponibles: ${available.join(', ')}`
        : 'Aucun outil disponible';
    super(`Outil inconnu "${toolName}". ${hint}`);
    this.name = 'ToolNotFoundError';
  }
}

class ToolRegistry {
  private readonly registeredTools = new Map<string, ToolDefinition>();

  private readonly registeredCallbacks = new Map<string, ToolCallback>();

  constructor(private readonly server: McpServer) {}

  public register(tool: ToolDefinition): void {
    const callback = this.attachMiddlewares(tool) as ToolCallback;
    this.server.registerTool(tool.name, tool.config as never, callback as never);
    this.registeredTools.set(tool.name, tool);
    this.registeredCallbacks.set(tool.name, callback);
  }

  public registerMany(tools: ToolDefinition[]): void {
    tools.forEach((tool) => this.register(tool));
    this.server.sendToolListChanged();
  }

  public listTools(): string[] {
    return Array.from(this.registeredTools.keys());
  }

  public async invoke(
    name: string,
    args: unknown,
    extra?: unknown
  ): Promise<ToolExecutionResult> {
    const callback = this.registeredCallbacks.get(name);
    if (!callback) {
      throw new ToolNotFoundError(name, this.listTools());
    }

    return (await callback(args as never, extra as never)) as ToolExecutionResult;
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

export { ToolRegistry, ToolNotFoundError };
