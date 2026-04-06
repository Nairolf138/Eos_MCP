/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  evaluateToolCompatibility,
  resolveCompatibilityContext
} from '../compatibilityMatrix';

describe('compatibilityMatrix', () => {
  it('applique la regle Primary pour eos_magic_sheet_send_string', () => {
    const status = evaluateToolCompatibility('eos_magic_sheet_send_string', {
      eosVersion: '3.2.0',
      role: 'Backup'
    });

    expect(status.compatible).toBe(false);
    expect(status.reasons.join(' ')).toContain('Role requis: Primary');
  });

  it('applique la regle baseline pour un outil eos standard', () => {
    const status = evaluateToolCompatibility('eos_cue_go', {
      eosVersion: '3.1.0',
      role: 'Unknown'
    });

    expect(status.compatible).toBe(true);
    expect(status.requirements.minEosVersion).toBe('3.0.0');
  });

  it('reconstruit le contexte a partir de args et extra', () => {
    const context = resolveCompatibilityContext(
      { eos_version: '3.3.0' },
      { connection: { role: 'Primary' } }
    );

    expect(context).toEqual({
      eosVersion: '3.3.0',
      role: 'Primary'
    });
  });
});
