/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import {
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
  channelRangeSchema,
  cueNumberSchema,
  dmxAddressSchema,
  dmxValueSchema,
  ensureTimeout,
  levelValueSchema,
  optionalTimeoutMsSchema,
  parseNumberRangeString,
  safeChannelRangeTextSchema,
  userIdSchema,
  validateCueArgumentsPair
} from '../validators';
import { ErrorCode, isAppError } from '../../server/errors';

describe('validators', () => {
  it('valide un timeout dans la plage autorisee', () => {
    expect(ensureTimeout(TIMEOUT_MIN_MS)).toBe(TIMEOUT_MIN_MS);
    expect(ensureTimeout(TIMEOUT_MAX_MS)).toBe(TIMEOUT_MAX_MS);
  });

  it('signale une valeur hors plage', () => {
    try {
      ensureTimeout(TIMEOUT_MAX_MS + 1);
      throw new Error('expected ensureTimeout to throw');
    } catch (error) {
      if (!isAppError(error)) {
        throw error;
      }
      expect(error.code).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE);
      expect(error.message).toContain(`${TIMEOUT_MAX_MS}`);
    }
  });

  it('refuse un timeout optionnel invalide', () => {
    const result = optionalTimeoutMsSchema.safeParse(TIMEOUT_MIN_MS - 1);
    expect(result.success).toBe(false);
  });

  it('normalise les formats de plage FR/EN', () => {
    expect(parseNumberRangeString('Chan 101-103 et 105, 107 thru 108')).toEqual([101, 102, 103, 105, 107, 108]);
    expect(parseNumberRangeString('1;2/3 + 4')).toEqual([1, 2, 3, 4]);
  });

  it('accepte les plages de canaux en chaine via schema', () => {
    const parsed = channelRangeSchema.parse('Channels 10-12, 15');
    expect(parsed).toEqual([10, 11, 12, 15]);
  });

  it('refuse les plages de canaux contenant du texte de commande libre', () => {
    expect(safeChannelRangeTextSchema.safeParse('1 Delete Cue 5').success).toBe(false);
    expect(channelRangeSchema.safeParse('1, Delete Cue 5').success).toBe(false);
    expect(channelRangeSchema.safeParse('Chan 1 Thru 3').success).toBe(true);
  });

  it('borne explicitement les identifiants et valeurs EOS dangereuses', () => {
    expect(userIdSchema.safeParse(999).success).toBe(true);
    expect(userIdSchema.safeParse(1000).success).toBe(false);
    expect(cueNumberSchema.safeParse('1.5').success).toBe(true);
    expect(cueNumberSchema.safeParse('1 Delete').success).toBe(false);
    expect(levelValueSchema.safeParse(100).success).toBe(true);
    expect(levelValueSchema.safeParse(101).success).toBe(false);
    expect(dmxValueSchema.safeParse(255).success).toBe(true);
    expect(dmxValueSchema.safeParse(256).success).toBe(false);
    expect(dmxAddressSchema.safeParse('2/512').success).toBe(true);
    expect(dmxAddressSchema.safeParse('2/513').success).toBe(false);
    expect(dmxAddressSchema.safeParse('1 Delete').success).toBe(false);
  });

  it('impose la coherence cue_part/cue_number', () => {
    const schema = z
      .object({
        cuelist_number: z.number().optional(),
        cue_number: z.union([z.string(), z.number()]).optional(),
        cue_part: z.number().optional()
      })
      .superRefine((value, ctx) => validateCueArgumentsPair(value, ctx));

    expect(schema.safeParse({ cuelist_number: 1, cue_number: '1', cue_part: 0 }).success).toBe(true);
    expect(schema.safeParse({ cuelist_number: 1, cue_part: 1 }).success).toBe(false);
  });
});
