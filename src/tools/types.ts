import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShape } from 'zod';

export type ToolExecutionResult = Awaited<ReturnType<ToolCallback<ZodRawShape | undefined>>>;

export interface ToolContext {
  name: string;
  args: unknown;
  extra: unknown;
}

export type ToolMiddleware = (
  context: ToolContext,
  next: () => Promise<ToolExecutionResult>
) => Promise<ToolExecutionResult>;

export interface ToolDefinition<Args extends ZodRawShape | undefined = ZodRawShape | undefined> {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Args;
    outputSchema?: ZodRawShape;
    annotations?: Record<string, unknown>;
  };
  handler: ToolCallback<Args>;
  middlewares?: ToolMiddleware[];
}
