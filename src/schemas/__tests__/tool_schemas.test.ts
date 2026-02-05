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

  it('marks the session as documented when a schema resource is read', async () => {
    const registerResource = jest.fn();
    const server = {
      registerResource
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

    const { registerToolSchemas } = await import('../index');
    const { clearManualDocumentationRead, hasSessionReadManual } =
      await import('../../resources/manualReadTracker');

    const sessionId = 'schema-resource-session';
    clearManualDocumentationRead(sessionId);
    registerToolSchemas(server);

    expect(registerResource).toHaveBeenCalled();
    const callback = registerResource.mock.calls[0][3] as (
      uri: URL,
      extra: { sessionId?: string }
    ) => Promise<unknown>;

    await callback(new URL('schema://tools/ping'), { sessionId });
    expect(hasSessionReadManual(sessionId)).toBe(true);
  });
});
