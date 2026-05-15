/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateToolCompatibility,
  getCompatibilityRulesForTools,
  getEosVersionFeatureCompatibility,
  resolveCompatibilityContext,
  type EosNodeRole
} from '../compatibilityMatrix';

interface VersionFixture {
  id: string;
  family: '2.x' | '3.x';
  eosVersion: string;
  role: EosNodeRole;
  expectedCompatibility: Record<string, boolean>;
}

describe('compatibilityMatrix', () => {
  const fixturePath = join(__dirname, 'fixtures', 'eos-version-responses.json');
  const versionFixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as VersionFixture[];

  it('applique la regle Primary pour eos_magic_sheet_send_string', () => {
    const status = evaluateToolCompatibility('eos_magic_sheet_send_string', {
      eosVersion: '3.2.0',
      role: 'Backup'
    });

    expect(status.compatible).toBe(false);
    expect(status.requirements.feature).toBe('magic_sheets');
    expect(status.reasons.join(' ')).toContain('Role requis: Primary');
  });

  it('applique la regle baseline pour un outil eos standard', () => {
    const status = evaluateToolCompatibility('eos_get_show_name', {
      eosVersion: '3.1.0',
      role: 'Unknown'
    });

    expect(status.compatible).toBe(true);
    expect(status.requirements.minEosVersion).toBe('3.0.0');
  });

  it.each(versionFixtures)('valide les fixtures de compatibilite $id', (fixture) => {
    for (const [toolName, expected] of Object.entries(fixture.expectedCompatibility)) {
      const status = evaluateToolCompatibility(toolName, {
        eosVersion: fixture.eosVersion,
        role: fixture.role
      });

      expect(status.compatible).toBe(expected);
    }
  });

  it('liste les fonctionnalites demandees pour EOS 2.x et 3.x', () => {
    const matrix = getEosVersionFeatureCompatibility();
    const requiredFeatures = [
      'handshake',
      'cues',
      'macros',
      'patch',
      'pixel_maps',
      'dmx',
      'fpe',
      'magic_sheets',
      'speed_fallback'
    ];

    for (const family of ['2.x', '3.x'] as const) {
      const familyFeatures = matrix
        .filter((entry) => entry.eosVersionFamily === family)
        .map((entry) => entry.feature);

      expect(familyFeatures).toEqual(expect.arrayContaining(requiredFeatures));
    }
  });

  it('expose les regles par outil avec feature, version et disponibilite', () => {
    const rules = getCompatibilityRulesForTools([
      'eos_cue_go',
      'eos_macro_fire',
      'eos_patch_set_channel',
      'eos_pixmap_get_info',
      'eos_fpe_get_set_count',
      'eos_magic_sheet_send_string',
      'eos_set_dmx'
    ]);

    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'eos_cue_go', rule: expect.objectContaining({ feature: 'cues', minEosVersion: '2.0.0' }) }),
        expect.objectContaining({ tool: 'eos_macro_fire', rule: expect.objectContaining({ feature: 'macros', minEosVersion: '2.0.0' }) }),
        expect.objectContaining({ tool: 'eos_patch_set_channel', rule: expect.objectContaining({ feature: 'patch', functionalAvailability: 'limited' }) }),
        expect.objectContaining({ tool: 'eos_pixmap_get_info', rule: expect.objectContaining({ feature: 'pixel_maps', minEosVersion: '3.0.0' }) }),
        expect.objectContaining({ tool: 'eos_fpe_get_set_count', rule: expect.objectContaining({ feature: 'fpe', minEosVersion: '3.0.0' }) }),
        expect.objectContaining({ tool: 'eos_magic_sheet_send_string', rule: expect.objectContaining({ feature: 'magic_sheets', minEosVersion: '3.2.0' }) }),
        expect.objectContaining({ tool: 'eos_set_dmx', rule: expect.objectContaining({ feature: 'dmx', minEosVersion: '2.0.0' }) })
      ])
    );
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
