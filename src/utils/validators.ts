import { z } from 'zod';
import { createError, createOutOfRangeError, ErrorCode } from '../server/errors.js';

export const TIMEOUT_MIN_MS = 50;
export const TIMEOUT_MAX_MS = 60_000;

export const portSchema = z.number().int().min(1).max(65_535);
export const optionalPortSchema = portSchema.optional();

export const timeoutMsSchema = z.number().int().min(TIMEOUT_MIN_MS).max(TIMEOUT_MAX_MS);
export const optionalTimeoutMsSchema = timeoutMsSchema.optional();

export interface RangeOptions {
  field: string;
  min: number;
  max: number;
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
