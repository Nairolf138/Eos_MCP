import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolMiddleware,
  ToolContext
} from '../tools/types';

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

type RegisteredCallback = (args: unknown, extra: unknown) => Promise<ToolExecutionResult>;

interface RegisteredToolConfigSummary {
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
}

interface RegisteredToolSummary {
  name: string;
  config: RegisteredToolConfigSummary;
  metadata: {
    hasInputSchema: boolean;
    hasOutputSchema: boolean;
    inputSchemaResourceUri?: string;
    hasMiddlewares: boolean;
    middlewareCount: number;
  };
}

class ToolRegistry {
  private readonly registeredTools = new Map<string, ToolDefinition>();

  private readonly registeredCallbacks = new Map<string, RegisteredCallback>();

  constructor(private readonly server: McpServer) {}

  public register(tool: ToolDefinition): void {
    const callback = this.attachMiddlewares(tool);
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

  public getRegisteredSummaries(): RegisteredToolSummary[] {
    return Array.from(this.registeredTools.values()).map((tool) => {
      const hasInputSchema = Boolean(tool.config.inputSchema);
      const hasOutputSchema = Boolean(tool.config.outputSchema);

      return {
        name: tool.name,
        config: {
          title: tool.config.title,
          description: tool.config.description,
          annotations: tool.config.annotations
        },
        metadata: {
          hasInputSchema,
          hasOutputSchema,
          inputSchemaResourceUri: hasInputSchema
            ? `schema://tools/${tool.name}`
            : undefined,
          hasMiddlewares: Boolean(tool.middlewares?.length),
          middlewareCount: tool.middlewares?.length ?? 0
        }
      } satisfies RegisteredToolSummary;
    });
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

    return callback(args, extra);
  }

  private attachMiddlewares(tool: ToolDefinition): RegisteredCallback {
    const middlewares = tool.middlewares ?? [];
    if (middlewares.length === 0) {
      return tool.handler;
    }

    return (async (args: unknown, extra: unknown) => {
      const context: ToolContext = { name: tool.name, args, extra };

      const executeHandler = (): Promise<ToolExecutionResult> =>
        Promise.resolve(tool.handler(args, extra));

      return this.compose(middlewares, executeHandler)(context);
    }) as RegisteredCallback;
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
export type { RegisteredToolSummary, RegisteredToolConfigSummary };
