import type { ToolDefinition, ToolExecutionResult } from '../../types';

type ToolContentEntry = ToolExecutionResult['content'][number];

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

export function getStructuredContent(
  result: ToolExecutionResult
): Record<string, unknown> | undefined {
  const { structuredContent } = result;
  if (structuredContent && typeof structuredContent === 'object' && !Array.isArray(structuredContent)) {
    return structuredContent as Record<string, unknown>;
  }
  return undefined;
}

export function isTextContent(entry: ToolContentEntry): entry is TextContent {
  if (entry.type !== 'text') {
    return false;
  }

  const candidate = entry as { text?: unknown };
  return typeof candidate.text === 'string';
}
