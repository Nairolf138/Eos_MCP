import { z, type ZodRawShape } from 'zod';
import type { ToolExecutionResult } from '../types';

export const safetyLevelSchema = z.enum(['strict', 'standard', 'off']);

export const safetyOptionsSchema = {
  dry_run: z.boolean().optional(),
  require_confirmation: z.boolean().optional(),
  safety_level: safetyLevelSchema.optional()
} satisfies ZodRawShape;

export interface SafetyOptions {
  dry_run?: boolean;
  require_confirmation?: boolean;
  safety_level?: z.infer<typeof safetyLevelSchema>;
}

export function resolveSafetyOptions(options: SafetyOptions): {
  dryRun: boolean;
  requireConfirmation: boolean;
  safetyLevel: z.infer<typeof safetyLevelSchema>;
} {
  return {
    dryRun: options.dry_run === true,
    requireConfirmation: options.require_confirmation === true,
    safetyLevel: options.safety_level ?? 'strict'
  };
}

export function assertSensitiveActionAllowed(options: SafetyOptions, action: string): void {
  const safety = resolveSafetyOptions(options);
  if (safety.safetyLevel !== 'off' && !safety.requireConfirmation) {
    throw new Error(
      `Action sensible bloquee (${action}). Ajoutez require_confirmation=true pour confirmer explicitement.`
    );
  }
}

export function createDryRunResult(params: {
  text: string;
  action: string;
  request?: unknown;
  oscAddress: string;
  oscArgs: unknown;
  cli?: { text: string };
  extra?: Record<string, unknown>;
}): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: `[dry_run] ${params.text}` }],
    structuredContent: {
      action: params.action,
      dry_run: true,
      request: params.request,
      osc: {
        address: params.oscAddress,
        args: params.oscArgs
      },
      ...(params.cli ? { cli: params.cli } : {}),
      ...(params.extra ?? {})
    }
  } as ToolExecutionResult;
}

export function isSensitiveCommandText(command: string): boolean {
  const normalized = command.toLowerCase();
  const patterns = [
    /\brecord\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\blive\s+fire\b/,
    /\bfire\b/
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}
