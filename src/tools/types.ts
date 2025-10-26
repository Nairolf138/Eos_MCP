import type { ZodRawShape } from 'zod';

export interface ToolResultContent {
  type: string;
  [key: string]: unknown;
}

export interface ToolExecutionResult {
  content: ToolResultContent[];
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

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
  handler: (args: unknown, extra: unknown) => Promise<ToolExecutionResult>;
  middlewares?: ToolMiddleware[];
}
