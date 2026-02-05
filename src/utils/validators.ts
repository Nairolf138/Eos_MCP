import { z } from 'zod';
import { createError, createOutOfRangeError, ErrorCode } from '../server/errors';

export const TIMEOUT_MIN_MS = 50;
export const TIMEOUT_MAX_MS = 60_000;
export const EOS_OBJECT_MIN = 1;
export const EOS_OBJECT_MAX = 99_999;

export const portSchema = z.number().int().min(1).max(65_535);
export const optionalPortSchema = portSchema.optional();

export const timeoutMsSchema = z.number().int().min(TIMEOUT_MIN_MS).max(TIMEOUT_MAX_MS);
export const optionalTimeoutMsSchema = timeoutMsSchema.optional();

export const cuelistNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const cueObjectNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const paletteNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const presetNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const channelNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);

export interface RangeOptions {
  field: string;
  min: number;
  max: number;
}

const DEFAULT_ALIAS_TOKENS = ['chan', 'channel', 'channels', 'ch', 'cue', 'cues', 'list', 'cuelist', 'palette', 'preset', 'address', 'addresses', 'addr'];

function parseIntegerToken(token: string): number | null {
  const cleaned = token.trim().replace(/[^0-9+-]/g, '');
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normaliseRangeString(input: string): string {
  return input
    .replace(/[–—−]/g, '-')
    .replace(/\b(thru|through|to|jusqu(?:'|e )?a|a)\b/gi, '-')
    .replace(/\b(et|and|with)\b/gi, ',')
    .replace(/[;|/＋+]+/g, ',')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseNumberRangeString(
  input: string,
  options: { min?: number; max?: number; aliases?: string[] } = {}
): number[] {
  const min = options.min ?? EOS_OBJECT_MIN;
  const max = options.max ?? EOS_OBJECT_MAX;
  const aliases = [...DEFAULT_ALIAS_TOKENS, ...(options.aliases ?? [])].sort((a, b) => b.length - a.length);

  const aliasPattern = new RegExp(`\\b(?:${aliases.map((token) => token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  const normalised = normaliseRangeString(input).replace(aliasPattern, ' ');
  const parts = normalised.split(',').map((value) => value.trim()).filter(Boolean);

  const result = new Set<number>();

  for (const part of parts) {
    const match = part.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (match) {
      const start = parseIntegerToken(match[1]);
      const end = parseIntegerToken(match[2]);
      if (start == null || end == null) {
        continue;
      }
      const lower = Math.min(start, end);
      const upper = Math.max(start, end);
      for (let value = lower; value <= upper; value += 1) {
        if (value >= min && value <= max) {
          result.add(value);
        }
      }
      continue;
    }

    const value = parseIntegerToken(part);
    if (value != null && value >= min && value <= max) {
      result.add(value);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

export const channelRangeSchema = z
  .union([
    channelNumberSchema,
    z.array(channelNumberSchema).min(1),
    z.string().trim().min(1)
  ])
  .transform((value, ctx): number[] => {
    if (typeof value === 'number') {
      return [value];
    }

    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => Math.trunc(item)))).sort((a, b) => a - b);
    }

    const parsed = parseNumberRangeString(value, { min: EOS_OBJECT_MIN, max: EOS_OBJECT_MAX });
    if (parsed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format de plage invalide. Exemples: "101-110", "1,2,3", "Chan 1 Thru 3".'
      });
      return z.NEVER;
    }
    return parsed;
  });

export function validateCueArgumentsPair(
  value: { cue_number?: unknown; cue_part?: unknown; cuelist_number?: unknown },
  ctx: z.RefinementCtx,
  options: { requireCuelistWithCue?: boolean } = { requireCuelistWithCue: true }
): void {
  if (value.cue_part != null && value.cue_number == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cue_part'],
      message: 'cue_part requiert cue_number.'
    });
  }

  if (options.requireCuelistWithCue && value.cue_number != null && value.cuelist_number == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cuelist_number'],
      message: 'cuelist_number est obligatoire quand cue_number est fourni.'
    });
  }
}

export function ensureFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createError(ErrorCode.VALIDATION_ERROR, {
      message: `Le champ ${field} doit etre un nombre fini.`,
      details: { field, value }
    });
  }
  return value;
}

export function ensureWithinRange(value: number, options: RangeOptions): number {
  const normalised = ensureFiniteNumber(value, options.field);
  if (normalised < options.min || normalised > options.max) {
    throw createOutOfRangeError(options.field, normalised, options.min, options.max);
  }
  return normalised;
}

export function ensureTimeout(value: number, field = 'timeoutMs'): number {
  return ensureWithinRange(Math.trunc(value), {
    field,
    min: TIMEOUT_MIN_MS,
    max: TIMEOUT_MAX_MS
  });
}
