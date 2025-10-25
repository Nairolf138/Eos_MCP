import type { ToolDefinition, ToolExecutionResult } from '../../types';

type ToolContentEntry = ToolExecutionResult['content'][number];

export interface ObjectContent extends ToolContentEntry {
  type: 'object';
  data: Record<string, unknown>;
}

export interface TextContent extends ToolContentEntry {
  type: 'text';
  text: string;
}

export async function runTool(
  tool: ToolDefinition,
  args: unknown,
  extra: unknown = {}
): Promise<ToolExecutionResult> {
  return tool.handler(args, extra);
}

export function isObjectContent(entry: ToolContentEntry): entry is ObjectContent {
  if (entry.type !== 'object') {
    return false;
  }

  const candidate = entry as { data?: unknown };
  return typeof candidate.data === 'object' && candidate.data !== null;
}

export function isTextContent(entry: ToolContentEntry): entry is TextContent {
  if (entry.type !== 'text') {
    return false;
  }

  const candidate = entry as { text?: unknown };
  return typeof candidate.text === 'string';
}
