/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
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

export type ToolResultStatus = 'ok' | 'partial_failure' | 'error' | 'dry_run';

export interface ToolResultWarning {
  code?: string;
  detail: string;
}

export interface BuildToolResultOptions {
  text?: string;
  status?: ToolResultStatus | string;
  summary?: string;
  commandsSent?: string[];
  commands_preview?: string[];
  warnings?: Array<string | ToolResultWarning>;
  next_actions?: string[];
  structuredContent?: Record<string, unknown>;
}

function normalizeWarnings(warnings?: Array<string | ToolResultWarning>): ToolResultWarning[] {
  return (warnings ?? []).map((warning) => (typeof warning === 'string' ? { detail: warning } : warning));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function collectCommands(
  explicitCommands: string[] | undefined,
  structuredContent: Record<string, unknown>,
  fallbackCommand?: unknown
): string[] {
  if (explicitCommands) {
    return explicitCommands;
  }
  const existing = normalizeStringArray(structuredContent.commandsSent);
  if (existing.length > 0 || structuredContent.dry_run === true) {
    return existing;
  }
  if (typeof fallbackCommand === 'string' && fallbackCommand.length > 0) {
    return [fallbackCommand];
  }
  const cli = structuredContent.cli;
  if (cli && typeof cli === 'object' && !Array.isArray(cli) && typeof (cli as { text?: unknown }).text === 'string') {
    return [(cli as { text: string }).text];
  }
  const osc = structuredContent.osc;
  if (osc && typeof osc === 'object' && !Array.isArray(osc)) {
    const args = (osc as { args?: unknown }).args;
    const argStrings = normalizeStringArray(args);
    if (argStrings.length > 0) {
      return argStrings;
    }
  }
  return [];
}

/**
 * Builds the common MCP tool result envelope used by LLM-facing handlers.
 *
 * Convention:
 * - content[0].text is always the concise human-readable summary.
 * - structuredContent.status and structuredContent.summary mirror the high-level outcome.
 * - structuredContent.commandsSent lists commands actually sent to EOS/OSC.
 * - structuredContent.commands_preview lists dry-run/planned commands.
 * - structuredContent.warnings and structuredContent.next_actions are always arrays.
 */
export function buildToolResult(options: BuildToolResultOptions): ToolExecutionResult {
  const structuredContent = { ...(options.structuredContent ?? {}) };
  const summary = options.summary ?? options.text ?? (typeof structuredContent.summary === 'string' ? structuredContent.summary : 'Operation terminee.');
  const status = options.status ?? (typeof structuredContent.status === 'string' ? structuredContent.status : 'ok');
  const commandsSent = collectCommands(options.commandsSent, structuredContent, structuredContent.command);
  const commandsPreview = options.commands_preview ?? normalizeStringArray(structuredContent.commands_preview);
  const warnings = normalizeWarnings(
    options.warnings ?? (Array.isArray(structuredContent.warnings) ? structuredContent.warnings as Array<string | ToolResultWarning> : undefined)
  );
  const nextActions = options.next_actions ?? normalizeStringArray(structuredContent.next_actions);

  return {
    content: [{ type: 'text', text: options.text ?? summary }],
    structuredContent: {
      ...structuredContent,
      status,
      summary,
      commandsSent,
      commands_preview: commandsPreview,
      warnings,
      next_actions: nextActions
    }
  };
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
