/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { createError, createOutOfRangeError, ErrorCode } from '../server/errors';

export const TIMEOUT_MIN_MS = 50;
export const TIMEOUT_MAX_MS = 60_000;
export const EOS_OBJECT_MIN = 1;
export const EOS_OBJECT_MAX = 99_999;
export const EOS_USER_MIN = 0;
export const EOS_USER_MAX = 999;
export const EOS_SOFTKEY_MIN = 1;
export const EOS_SOFTKEY_MAX = 12;
export const EOS_MACRO_MAX = 9_999;
export const EOS_SUBMASTER_MAX = 9_999;
export const DMX_ABSOLUTE_ADDRESS_MAX = 65_535;
export const DMX_UNIVERSE_MIN = 1;
export const DMX_UNIVERSE_MAX = 9_999;
export const DMX_SLOT_MIN = 1;
export const DMX_SLOT_MAX = 512;

export const portSchema = z.number().int().min(1).max(65_535);
export const optionalPortSchema = portSchema.optional();

export const timeoutMsSchema = z.number().int().min(TIMEOUT_MIN_MS).max(TIMEOUT_MAX_MS);
export const optionalTimeoutMsSchema = timeoutMsSchema.optional();

export const cuelistNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const cueObjectNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const paletteNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const presetNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const channelNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX);
export const userIdSchema = z.coerce.number().int().min(EOS_USER_MIN).max(EOS_USER_MAX);
export const softkeyIndexSchema = z.coerce
  .number()
  .int()
  .min(EOS_SOFTKEY_MIN, 'Le numero de softkey doit etre compris entre 1 et 12')
  .max(EOS_SOFTKEY_MAX, 'Le numero de softkey doit etre compris entre 1 et 12');
export const macroNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_MACRO_MAX);
export const submasterNumberSchema = z.coerce.number().int().min(EOS_OBJECT_MIN).max(EOS_SUBMASTER_MAX);

const numericTextSchema = (min: number, max: number, label: string) => z.string().trim().min(1).refine((value) => {
  const text = value.endsWith('%') ? value.slice(0, -1) : value;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}, `${label} doit etre une valeur numerique comprise entre ${min} et ${max}.`);

export const levelValueSchema = z.union([
  z.number().finite().min(0).max(100),
  z.enum(['full', 'Full', 'FULL', 'out', 'Out', 'OUT']),
  numericTextSchema(0, 100, 'Le niveau')
]);

export const dmxValueSchema = z.union([
  z.number().int().min(0).max(255),
  z.enum(['full', 'Full', 'FULL', 'out', 'Out', 'OUT']),
  numericTextSchema(0, 255, 'La valeur DMX').refine((value) => Number.isInteger(Number(value.replace(',', '.'))), 'La valeur DMX doit etre un entier entre 0 et 255.')
]);

export const dmxAddressSchema = z
  .union([
    z.coerce.number().int().min(1).max(DMX_ABSOLUTE_ADDRESS_MAX),
    z.string().trim().min(1).max(32).refine((value) => {
      const normalised = value.replace(/\s+/g, '');
      if (/^\d+$/.test(normalised)) {
        const absolute = Number.parseInt(normalised, 10);
        return absolute >= 1 && absolute <= DMX_ABSOLUTE_ADDRESS_MAX;
      }
      const match = /^(\d{1,4})[./:-](\d{1,3})$/.exec(normalised);
      if (!match) {
        return false;
      }
      const universe = Number.parseInt(match[1]!, 10);
      const slot = Number.parseInt(match[2]!, 10);
      return universe >= DMX_UNIVERSE_MIN && universe <= DMX_UNIVERSE_MAX && slot >= DMX_SLOT_MIN && slot <= DMX_SLOT_MAX;
    }, "Adresse DMX invalide. Utilisez un numero absolu 1-65535 ou un format univers/adresse avec univers 1-9999 et adresse 1-512.")
  ])
  .transform((value) => (typeof value === 'number' ? String(value) : value.trim()))
  .describe("Adresse DMX au format 'univers/adresse' ou numero absolu.");

export const cueNumberSchema = z.union([
  z.number().finite().min(EOS_OBJECT_MIN).max(EOS_OBJECT_MAX),
  z.string().trim().min(1).max(16).regex(/^\d{1,5}(?:\.\d{1,3})?$/, 'Numero de cue invalide. Utilisez un numero 1-99999 avec partie decimale optionnelle.').refine((value) => {
    const [whole] = value.split('.');
    const parsed = Number.parseInt(whole ?? '', 10);
    return parsed >= EOS_OBJECT_MIN && parsed <= EOS_OBJECT_MAX;
  }, `Le numero de cue doit etre compris entre ${EOS_OBJECT_MIN} et ${EOS_OBJECT_MAX}.`)
]);

export const safeChannelRangeTextSchema = z.string().trim().min(1).max(256).refine((value) => {
  return isNumberRangeStringValid(value, { min: EOS_OBJECT_MIN, max: EOS_OBJECT_MAX });
}, 'Format de plage de canaux invalide. Exemples: "101-110", "1,2,3", "Chan 1 Thru 3".');

export interface RangeOptions {
  field: string;
  min: number;
  max: number;
}

const DEFAULT_ALIAS_TOKENS = ['chan', 'channel', 'channels', 'ch', 'cue', 'cues', 'list', 'cuelist', 'palette', 'preset', 'address', 'addresses', 'addr'];

function createAliasPattern(aliases: string[]): RegExp {
  return new RegExp(`\\b(?:${aliases.map((token) => token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
}

function stripRangeAliases(input: string, aliases: string[]): string {
  return normaliseRangeString(input).replace(createAliasPattern(aliases), ' ');
}

function parseIntegerToken(token: string): number | null {
  const cleaned = token.trim();
  if (!/^[+-]?\d+$/.test(cleaned)) {
    return null;
  }
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

  const normalised = stripRangeAliases(input, aliases);
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

export function isNumberRangeStringValid(
  input: string,
  options: { min?: number; max?: number; aliases?: string[] } = {}
): boolean {
  const min = options.min ?? EOS_OBJECT_MIN;
  const max = options.max ?? EOS_OBJECT_MAX;
  const aliases = [...DEFAULT_ALIAS_TOKENS, ...(options.aliases ?? [])].sort((a, b) => b.length - a.length);
  const parts = stripRangeAliases(input, aliases).split(',').map((value) => value.trim()).filter(Boolean);

  if (parts.length === 0) {
    return false;
  }

  return parts.every((part) => {
    const match = part.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (match) {
      const start = parseIntegerToken(match[1]!);
      const end = parseIntegerToken(match[2]!);
      if (start == null || end == null) {
        return false;
      }
      const lower = Math.min(start, end);
      const upper = Math.max(start, end);
      return lower >= min && upper <= max;
    }

    const value = parseIntegerToken(part);
    return value != null && value >= min && value <= max;
  });
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

    if (!isNumberRangeStringValid(value, { min: EOS_OBJECT_MIN, max: EOS_OBJECT_MAX })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format de plage invalide. Exemples: "101-110", "1,2,3", "Chan 1 Thru 3".'
      });
      return z.NEVER;
    }
    const parsed = parseNumberRangeString(value, { min: EOS_OBJECT_MIN, max: EOS_OBJECT_MAX });
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
