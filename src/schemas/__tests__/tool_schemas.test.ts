/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import Ajv from 'ajv';
import { toolDefinitions } from '../../tools/index';
import { toolJsonSchemas } from '../index';

describe('tool JSON schemas', () => {
  it('generates a schema for every tool', () => {
    expect(toolJsonSchemas).toHaveLength(toolDefinitions.length);
    const schemaNames = new Set(toolJsonSchemas.map((schema) => schema.name));
    for (const tool of toolDefinitions) {
      expect(schemaNames.has(tool.name)).toBe(true);
    }
  });

  it('produces valid JSON Schema documents', () => {
    const ajv = new Ajv({ strict: false });

    for (const schema of toolJsonSchemas) {
      expect(() => ajv.compile(schema.schema)).not.toThrow();
    }
  });

  it('does not embed any consultation prerequisite in schema resources', () => {
    for (const schema of toolJsonSchemas) {
      const serializedSchema = JSON.stringify(schema.schema);
      expect(serializedSchema).not.toContain(
        "Consultation requise avant d'utiliser l'outil"
      );
    }
  });


  it('publie des schemas tolerants uniquement pour les workflows', () => {
    const workflowSchema = toolJsonSchemas.find((schema) => schema.name === 'eos_workflow_create_look')?.schema;
    const cueGoSchema = toolJsonSchemas.find((schema) => schema.name === 'eos_cue_go')?.schema;

    expect(workflowSchema).toBeDefined();
    expect(cueGoSchema).toBeDefined();

    expect((workflowSchema?.definitions as Record<string, { additionalProperties?: boolean }>).eos_workflow_create_look.additionalProperties).toBe(true);
    expect((cueGoSchema?.definitions as Record<string, { additionalProperties?: boolean }>).eos_cue_go.additionalProperties).toBe(false);
  });


  it('expose les metadonnees de decouverte dans les schemas des familles principales', () => {
    const expectedFamilies = new Map([
      ['eos_cue_go', 'cues'],
      ['eos_command', 'commands'],
      ['eos_key_press', 'keys'],
      ['eos_macro_fire', 'macros'],
      ['eos_address_set_dmx', 'dmx'],
      ['eos_palette_get_info', 'palettes'],
      ['eos_preset_fire', 'presets'],
      ['eos_patch_get_channel_info', 'patch'],
      ['eos_set_cue_send_string', 'showControl']
    ]);

    for (const [toolName, category] of expectedFamilies) {
      const schema = toolJsonSchemas.find((candidate) => candidate.name === toolName);
      expect(schema?.metadata).toEqual(expect.objectContaining({
        category,
        synonyms: expect.any(Array),
        riskLevel: expect.any(String),
        requiresConfirmation: expect.any(Boolean)
      }));
      expect(schema?.schema).toMatchObject({
        'x-eos-metadata': expect.objectContaining({ category })
      });
    }

    const patchSchema = toolJsonSchemas.find((schema) => schema.name === 'eos_patch_get_channel_info');
    expect(patchSchema?.metadata).toMatchObject({
      category: 'patch',
      riskLevel: 'critical',
      preferredWorkflow: 'eos_workflow_autopatch_band'
    });
  });


  it('publie dry_run sur tous les workflows', () => {
    const workflowSchemas = toolJsonSchemas.filter((schema) => schema.name.startsWith('eos_workflow_'));

    expect(workflowSchemas.length).toBeGreaterThan(0);
    for (const schema of workflowSchemas) {
      const definition = (schema.schema.definitions as Record<string, { properties?: Record<string, unknown> }>)[schema.name];
      expect(definition.properties).toHaveProperty('dry_run');
    }
  });

});
