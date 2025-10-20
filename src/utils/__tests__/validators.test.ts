import { describe, expect, it } from '@jest/globals';
import {
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
  ensureTimeout,
  optionalTimeoutMsSchema
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
});
