import { z, type ZodRawShape } from 'zod';
import type { OscMessageArgument } from '../../services/osc/index';
import type { ToolExecutionResult } from '../types';
import { safetyOptionsSchema } from '../common/safety';
import type { CueIdentifier } from './types';

export const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  ...safetyOptionsSchema
} satisfies ZodRawShape;

export const cuelistNumberSchema = z.coerce.number().int().min(1).max(99999);

export const cueNumberSchema = z.union([z.string().min(1), z.number()]);

export const cuePartSchema = z.coerce.number().int().min(0).max(99);

export interface CueCommandOptions {
  cuelist_number?: number | null;
  cue_number?: string | number | null;
  cue_part?: number | null;
}

export function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  return [
    {
      type: 's' as const,
      value: JSON.stringify(payload)
    }
  ];
}

export function extractTargetOptions<T extends { targetAddress?: string; targetPort?: number }>(
  options: T
): { targetAddress?: string; targetPort?: number } {
  const target: { targetAddress?: string; targetPort?: number } = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
}

function normaliseCueNumberValue(value: string | number | null | undefined): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function normaliseCuePartValue(value: number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const truncated = Math.trunc(value);
    return truncated >= 0 ? truncated : null;
  }
  return null;
}

export function createCueIdentifierFromOptions(options: CueCommandOptions): CueIdentifier {
  const cuelistNumber =
    typeof options.cuelist_number === 'number' && Number.isFinite(options.cuelist_number)
      ? Math.trunc(options.cuelist_number)
      : null;

  const cueNumber = normaliseCueNumberValue(options.cue_number);
  const cuePart = normaliseCuePartValue(options.cue_part);

  return {
    cuelistNumber,
    cueNumber,
    cuePart
  };
}

export function buildCueCommandPayload(
  identifier: CueIdentifier,
  options: { defaultPart?: number | null } = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (identifier.cuelistNumber != null) {
    payload.cuelist = identifier.cuelistNumber;
    payload.list = identifier.cuelistNumber;
    payload.cuelist_number = identifier.cuelistNumber;
  }

  if (identifier.cueNumber != null) {
    payload.cue = identifier.cueNumber;
    payload.cue_number = identifier.cueNumber;
    payload.number = identifier.cueNumber;
  }

  const part = identifier.cuePart ?? options.defaultPart ?? null;
  if (part != null) {
    payload.part = part;
    payload.cue_part = part;
  }

  return payload;
}

export function formatCueDescription(identifier: CueIdentifier): string {
  const parts: string[] = [];
  if (identifier.cuelistNumber != null) {
    parts.push(`liste ${identifier.cuelistNumber}`);
  }
  if (identifier.cueNumber != null) {
    const suffix = identifier.cuePart != null && identifier.cuePart !== 0 ? `.${identifier.cuePart}` : '';
    parts.push(`cue ${identifier.cueNumber}${suffix}`);
  }
  if (parts.length === 0) {
    return 'cue';
  }
  return parts.join(' ');
}

export interface CueCommandResultOverrides {
  request?: unknown;
  oscAddress?: string;
  oscArgs?: unknown;
  cli?: { text: string };
}

export function createCueCommandResult(
  action: string,
  identifier: CueIdentifier,
  payload: Record<string, unknown>,
  oscAddress: string,
  extra: Record<string, unknown> = {},
  overrides: CueCommandResultOverrides = {}
): ToolExecutionResult {
  const text = `Commande ${action} envoyee pour ${formatCueDescription(identifier)}.`;
  const request = overrides.request ?? payload;
  const address = overrides.oscAddress ?? oscAddress;
  const oscArgs = overrides.oscArgs ?? payload;
  const cli = overrides.cli;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      action,
      identifier,
      request,
      osc: {
        address,
        args: oscArgs
      },
      ...(cli ? { cli } : {}),
      ...extra
    }
  } as ToolExecutionResult;
}
