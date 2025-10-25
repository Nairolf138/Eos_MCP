import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import { HttpGateway } from '../httpGateway';
import type { ManifestDocument } from '../httpGateway';
import type { ToolRegistry } from '../toolRegistry';

describe('HttpGateway manifest prefix handling', () => {
  test('applies publicUrl pathname prefix to manifest URLs', () => {
    const gateway = new HttpGateway({} as unknown as ToolRegistry, {
      port: 0,
      publicUrl: 'https://example.com/mcp'
    });

    const manifestPath = path.resolve(__dirname, '../../..', 'manifest.json');
    const manifestTemplate = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    Object.assign(gateway as unknown as { manifestTemplate: unknown }, { manifestTemplate });

    const manifest = (
      gateway as unknown as { buildManifestResponse(req: Request): ManifestDocument }
    ).buildManifestResponse(
      {} as Request
    );

    const baseUrl = 'https://example.com/mcp/';
    const server = manifest.mcp?.servers?.[0]?.server;

    expect(server?.transport?.url).toBe(baseUrl);

    const collectedValues: string[] = [];
    const sanitize = (value: string): string => value.replace(/\{[^}]+\}/g, 'placeholder');

    const endpoints = (server?.endpoints ?? {}) as Record<string, unknown>;
    Object.values(endpoints).forEach((value) => {
      if (typeof value === 'string') {
        collectedValues.push(value);
      }
    });

    const toolsCapabilities = manifest.mcp?.capabilities?.tools as Record<string, unknown> | undefined;
    if (toolsCapabilities) {
      const listEndpoint = toolsCapabilities.list_endpoint;
      if (typeof listEndpoint === 'string') {
        collectedValues.push(listEndpoint);
      }

      const invokeEndpoint = toolsCapabilities.invoke_endpoint;
      if (typeof invokeEndpoint === 'string') {
        collectedValues.push(invokeEndpoint);
      }

      const schemaCatalogs = toolsCapabilities.schema_catalogs;
      if (Array.isArray(schemaCatalogs)) {
        schemaCatalogs.forEach((entry) => {
          if (typeof entry === 'string') {
            collectedValues.push(entry);
          }
        });
      }

      const schemaBasePath = toolsCapabilities.schema_base_path;
      if (typeof schemaBasePath === 'string') {
        collectedValues.push(schemaBasePath);
      }
    }

    const schemas = manifest.mcp?.schemas as Record<string, unknown> | undefined;
    if (schemas) {
      Object.values(schemas).forEach((value) => {
        if (typeof value === 'string') {
          collectedValues.push(value);
        }
      });
    }

    expect(collectedValues).not.toHaveLength(0);
    collectedValues.forEach((value) => {
      expect(value.startsWith('/')).toBe(false);
      const resolvedPath = new URL(sanitize(value), baseUrl).pathname;
      expect(resolvedPath.startsWith('/mcp/')).toBe(true);
    });
  });
});
