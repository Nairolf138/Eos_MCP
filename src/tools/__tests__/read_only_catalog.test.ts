/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { toolDefinitions } from '../index';

describe('tool catalog read-only classification', () => {
  it('classifie chaque outil avec readOnly, riskLevel et requiresConfirmation', () => {
    for (const tool of toolDefinitions) {
      expect(tool.metadata).toEqual(expect.objectContaining({
        readOnly: expect.any(Boolean),
        riskLevel: expect.stringMatching(/^(low|medium|high|critical)$/),
        requiresConfirmation: expect.any(Boolean)
      }));
      expect(tool.config.annotations).toEqual(expect.objectContaining({
        readOnly: tool.metadata?.readOnly,
        riskLevel: tool.metadata?.riskLevel,
        requiresConfirmation: tool.metadata?.requiresConfirmation
      }));
    }
  });

  it('marque les outils de commande console comme non lecture seule', () => {
    const dangerousNames = ['eos_command', 'eos_new_command', 'eos_cue_go', 'eos_patch_set_channel'];

    for (const toolName of dangerousNames) {
      const tool = toolDefinitions.find((candidate) => candidate.name === toolName);
      expect(tool?.metadata).toEqual(expect.objectContaining({ readOnly: false }));
    }
  });
});
