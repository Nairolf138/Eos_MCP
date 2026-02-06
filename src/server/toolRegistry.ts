import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger';
import { runWithRequestContext } from './requestContext';
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolMiddleware,
  ToolContext
} from '../tools/types';
import { setCapabilitiesToolNamesProvider } from '../tools/capabilities/context';

const logger = createLogger('tool-registry');

const SENSITIVE_FIELD_PATTERN = /(token|password|secret|authorization|api[-_]?key|cookie)/i;

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[MaxDepth]';
  }

  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    return Object.fromEntries(
      entries.map(([key, entryValue]) => {
        if (SENSITIVE_FIELD_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }
        return [key, sanitizeValue(entryValue, depth + 1)];
      })
    );
  }

  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function resolveCorrelationId(extra: unknown): string {
  const record = asObject(extra);
  const candidates = [record.correlationId, record.requestId, record.traceId];

  const found = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return found as string | undefined ?? randomUUID();
}

function resolveSessionId(extra: unknown): string | undefined {
  const record = asObject(extra);
  const candidates = [record.sessionId, record.mcpSessionId, record.connectionId];
  const found = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return found as string | undefined;
}

function resolveUserId(args: unknown, extra: unknown): number | undefined {
  const argUser = asObject(args).user;
  if (typeof argUser === 'number' && Number.isFinite(argUser)) {
    return Math.trunc(argUser);
  }

  const extraUser = asObject(extra).userId;
  if (typeof extraUser === 'number' && Number.isFinite(extraUser)) {
    return Math.trunc(extraUser);
  }

  return undefined;
}

function resolveSafetyMode(args: unknown): 'strict' | 'standard' | 'off' {
  const safetyLevel = asObject(args).safety_level;
  if (safetyLevel === 'strict' || safetyLevel === 'standard' || safetyLevel === 'off') {
    return safetyLevel;
  }

  return 'strict';
}

function isSensitiveAction(args: unknown): boolean {
  const record = asObject(args);
  if (record.require_confirmation === true) {
    return true;
  }

  const command = record.command;
  if (typeof command === 'string') {
    return /\b(record|update|delete|fire)\b/i.test(command);
  }

  return false;
}

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

type RegisteredCallback = (
  first: unknown,
  second?: unknown
) => Promise<ToolExecutionResult>;

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
    const hasInputSchema = Boolean(tool.config.inputSchema);

    const handlerForServer = ((
      first: unknown,
      second?: unknown
    ): Promise<ToolExecutionResult> => {
      if (hasInputSchema) {
        return callback(first, second);
      }

      const extra = second ?? first;
      return callback(undefined, extra);
    }) as never;

    this.server.registerTool(tool.name, tool.config as never, handlerForServer);
    this.registeredTools.set(tool.name, tool);
    this.registeredCallbacks.set(tool.name, callback);
  }

  public registerMany(tools: ToolDefinition[]): void {
    const orderedTools = [...tools].sort((left, right) => {
      if (left.name === 'eos_capabilities_get') {
        return -1;
      }
      if (right.name === 'eos_capabilities_get') {
        return 1;
      }
      return 0;
    });

    setCapabilitiesToolNamesProvider(() => orderedTools.map((tool) => tool.name));

    orderedTools.forEach((tool) => this.register(tool));
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
    const hasInputSchema = Boolean(tool.config.inputSchema);

    const normalizeInputs = (
      first: unknown,
      second?: unknown
    ): { args: unknown; extra: unknown } => {
      if (hasInputSchema) {
        return { args: first, extra: second };
      }

      const extra = second ?? first;
      return { args: undefined, extra };
    };

    if (middlewares.length === 0) {
      return async (first: unknown, second?: unknown) => {
        const { args, extra } = normalizeInputs(first, second);
        return this.executeWithAudit(tool.name, args, extra, () => tool.handler(args, extra));
      };
    }

    return async (first: unknown, second?: unknown) => {
      const { args, extra } = normalizeInputs(first, second);
      const context: ToolContext = { name: tool.name, args, extra };

      const executeHandler = (): Promise<ToolExecutionResult> =>
        Promise.resolve(tool.handler(args, extra));

      return this.executeWithAudit(tool.name, args, extra, () => this.compose(middlewares, executeHandler)(context));
    };
  }

  private async executeWithAudit(
    toolName: string,
    args: unknown,
    extra: unknown,
    execute: () => Promise<ToolExecutionResult>
  ): Promise<ToolExecutionResult> {
    const correlationId = resolveCorrelationId(extra);
    const sessionId = resolveSessionId(extra);
    const userId = resolveUserId(args, extra);
    const startedAt = Date.now();
    const safetyMode = resolveSafetyMode(args);
    const sensitiveAction = isSensitiveAction(args);
    const argsSanitized = sanitizeValue(args);
    const targetConsole = {
      address: asObject(args).targetAddress,
      port: asObject(args).targetPort
    };

    try {
      const result = await runWithRequestContext(
        {
          correlationId,
          ...(sessionId ? { sessionId } : {}),
          ...(typeof userId === 'number' ? { userId } : {})
        },
        () => execute()
      );

      logger.info({
        event: 'tool_execution_audit',
        toolName,
        correlationId,
        sessionId,
        userId,
        targetConsole,
        args: argsSanitized,
        result: sanitizeValue(result),
        sensitiveAction,
        safetyMode,
        durationMs: Date.now() - startedAt,
        status: 'ok'
      });

      return result;
    } catch (error) {
      logger.warn({
        event: 'tool_execution_audit',
        toolName,
        correlationId,
        sessionId,
        userId,
        targetConsole,
        args: argsSanitized,
        result: sanitizeValue(error instanceof Error ? { message: error.message, name: error.name } : error),
        sensitiveAction,
        safetyMode,
        durationMs: Date.now() - startedAt,
        status: 'error'
      });
      throw error;
    }
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
