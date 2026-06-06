/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ZodRawShape } from 'zod';
import type { StrictModeBehavior } from '../services/osc/messageBuilders';
import type { ToolSafetyProfile } from './common/safety';

export interface ToolResultContent {
  type: string;
  [key: string]: unknown;
}

export interface ToolExecutionResult {
  content: ToolResultContent[];
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}


export type ToolReadConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ToolReadSource {
  type: string;
  [key: string]: unknown;
}

export interface ToolReadConvention {
  /** High-level transport/tool status for the read. */
  status: string;
  /** Explicit origin of the data, e.g. EOS OSC live read or showfile import. */
  source: ToolReadSource;
  /** Confidence in returned read data. Failures must use "none". */
  confidence: ToolReadConfidence;
  /** True only when the requested EOS read completed and data is safe to interpret. */
  is_complete: boolean;
  /** Known limitations that constrain interpretation of the read. */
  limitations: string[];
  /** Operator actions required before the agent can rely on this read. */
  next_operator_actions: string[];
}

export interface BuildReadConventionOptions {
  status: string;
  source: ToolReadSource;
  confidence?: ToolReadConfidence;
  is_complete?: boolean;
  limitations?: string[];
  next_operator_actions?: string[];
  error?: string | null;
}

export const DEFAULT_EOS_READ_FAILURE_ACTIONS = [
  'Verifier que OSC RX et OSC TX sont actives sur la console Eos.',
  "Verifier que l'IP TX et les ports OSC de la console pointent vers ce serveur MCP.",
  "Relancer explicitement la lecture EOS demandee ou fournir une source showfile autorisee par l'operateur."
] as const;

export function buildReadConvention(options: BuildReadConventionOptions): ToolReadConvention {
  const isComplete = options.is_complete ?? options.status === 'ok';
  const failureLimitations = isComplete
    ? []
    : [
        `Lecture EOS incomplete: statut ${options.status}.`,
        ...(options.error ? [options.error] : [])
      ];

  return {
    status: options.status,
    source: options.source,
    confidence: options.confidence ?? (isComplete ? 'high' : 'none'),
    is_complete: isComplete,
    limitations: options.limitations ?? failureLimitations,
    next_operator_actions: options.next_operator_actions ?? (isComplete ? [] : [...DEFAULT_EOS_READ_FAILURE_ACTIONS])
  };
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

export type ToolRiskLevel = 'read' | 'preview' | 'live' | 'show-modifying' | 'dangerous';

export interface ToolMetadata {
  annotations?: Record<string, unknown>;
  readOnly?: boolean;
  category?: string;
  synonyms?: string[];
  riskLevel?: ToolRiskLevel;
  requiresConfirmation?: boolean;
  allowedInReadOnly?: boolean;
  allowedInStrictMode?: boolean;
  defaultDryRun?: boolean;
  nativeOscPreferred?: boolean;
  cmdFallbackAllowed?: boolean;
  strictModeBehavior?: StrictModeBehavior;
  preferredWorkflow?: string | string[];
  requiredRole?: ToolSafetyProfile;
}

export interface ToolDefinition<Args extends ZodRawShape | undefined = ZodRawShape | undefined> {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Args;
    outputSchema?: ZodRawShape;
    annotations?: Record<string, unknown>;
  };
  metadata?: ToolMetadata;
  handler: (args: unknown, extra: unknown) => Promise<ToolExecutionResult>;
  middlewares?: ToolMiddleware[];
}

function mergeToolMetadata(base: ToolMetadata | undefined, override: ToolMetadata): ToolMetadata {
  return {
    ...base,
    ...override,
    annotations: {
      ...(base?.annotations ?? {}),
      ...(override.annotations ?? {})
    },
    synonyms: override.synonyms ?? base?.synonyms,
    preferredWorkflow: override.preferredWorkflow ?? base?.preferredWorkflow
  };
}

export function withToolMetadata<T extends ToolDefinition>(
  tools: readonly T[],
  metadata: ToolMetadata
): T[] {
  return tools.map((tool) => {
    const mergedMetadata = mergeToolMetadata(tool.metadata, metadata);
    const { annotations: metadataAnnotations, ...annotationMetadata } = mergedMetadata;

    return {
      ...tool,
      config: {
        ...tool.config,
        annotations: {
          ...(tool.config.annotations ?? {}),
          ...metadataAnnotations,
          ...annotationMetadata
        }
      },
      metadata: mergedMetadata
    };
  });
}
