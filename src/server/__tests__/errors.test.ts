import { describe, expect, it } from '@jest/globals';
import {
  ErrorCode,
  createConnectionLostError,
  createOutOfRangeError,
  createTimeoutError,
  describeError
} from '../errors';

describe('errors', () => {
  it('cree une erreur de timeout contextualisee', () => {
    const error = createTimeoutError('le ping OSC', 750, 'Aucune reponse ping recu avant expiration');
    expect(error.code).toBe(ErrorCode.OSC_TIMEOUT);
    expect(error.message).toContain('le ping OSC');
    expect(error.message).toContain('750');
    expect(describeError(error).details?.timeoutMs).toBe(750);
  });

  it('cree une erreur de connexion perdue en preservant le message d\'origine', () => {
    const error = createConnectionLostError('le ping OSC', {
      message: 'Connection lost to console',
      address: '/eos/ping/reply'
    });
    expect(error.code).toBe(ErrorCode.OSC_CONNECTION_LOST);
    expect(error.message).toContain('Connexion OSC perdue');
    expect(error.message).toContain('Connection lost to console');
    expect(error.details?.address).toBe('/eos/ping/reply');
  });

  it('cree une erreur hors plage explicite', () => {
    const error = createOutOfRangeError('timeoutMs', 10, 50, 500);
    expect(error.code).toBe(ErrorCode.VALIDATION_OUT_OF_RANGE);
    expect(error.message).toContain('timeoutMs');
    expect(error.message).toContain('50');
  });
});
