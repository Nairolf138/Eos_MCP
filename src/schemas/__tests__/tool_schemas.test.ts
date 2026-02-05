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

});
