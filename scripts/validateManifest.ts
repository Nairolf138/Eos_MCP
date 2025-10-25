import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Ajv, { type JSONSchemaType } from 'ajv';

const HTTP_PUBLIC_URL_PLACEHOLDER = 'http://{HOST}:{PORT}';

interface Manifest {
  name: string;
  description: string;
  version: string;
  mcp: {
    schema_version: string;
    documentation_url?: string;
    servers: Array<{
      server: {
        transport: {
          type: string;
          url?: string;
        };
        endpoints?: Record<string, string>;
      };
    }>;
    capabilities: {
      tools?: {
        list_endpoint?: string;
        invoke_endpoint?: string;
        schema_catalogs?: string[];
        schema_base_path?: string;
      };
    };
    schemas?: {
      tool_catalog?: string;
    };
  };
}

const manifestSchema: JSONSchemaType<Manifest> = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'version', 'mcp'],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    version: { type: 'string', minLength: 1 },
    mcp: {
      type: 'object',
      additionalProperties: true,
      required: ['schema_version', 'servers', 'capabilities'],
      properties: {
        schema_version: { type: 'string', minLength: 1 },
        documentation_url: { type: 'string', nullable: true },
        servers: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['server'],
            properties: {
              server: {
                type: 'object',
                additionalProperties: true,
                required: ['transport'],
                properties: {
                  transport: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['type'],
                    properties: {
                      type: { type: 'string', minLength: 1 },
                      url: { type: 'string', nullable: true }
                    }
                  },
                  endpoints: {
                    type: 'object',
                    nullable: true,
                    required: [],
                    additionalProperties: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        capabilities: {
          type: 'object',
          additionalProperties: true,
          required: [],
          properties: {
            tools: {
              type: 'object',
              nullable: true,
              additionalProperties: true,
              required: [],
              properties: {
                list_endpoint: { type: 'string', nullable: true },
                invoke_endpoint: { type: 'string', nullable: true },
                schema_catalogs: {
                  type: 'array',
                  nullable: true,
                  items: { type: 'string', minLength: 1 }
                },
                schema_base_path: { type: 'string', nullable: true }
              }
            }
          }
        },
        schemas: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
          required: [],
          properties: {
            tool_catalog: { type: 'string', nullable: true }
          }
        }
      }
    }
  }
};

function ensureToolSchemaLinks(manifest: Manifest): void {
  const schemaCatalogs = manifest.mcp.capabilities.tools?.schema_catalogs ?? [];
  if (!schemaCatalogs.includes('/schemas/tools/index.json')) {
    throw new Error(
      "Le manifest doit référencer '/schemas/tools/index.json' dans mcp.capabilities.tools.schema_catalogs."
    );
  }

  const basePath = manifest.mcp.capabilities.tools?.schema_base_path;
  if (typeof basePath !== 'string' || basePath.length === 0) {
    throw new Error(
      "Le manifest doit définir mcp.capabilities.tools.schema_base_path vers les schémas JSON des outils."
    );
  }

  if (!basePath.includes('{toolName}')) {
    throw new Error(
      "Le champ mcp.capabilities.tools.schema_base_path doit contenir le placeholder '{toolName}'."
    );
  }

  const catalogRef = manifest.mcp.schemas?.tool_catalog;
  if (catalogRef !== '/schemas/tools/index.json') {
    throw new Error(
      "Le manifest doit aligner mcp.schemas.tool_catalog sur '/schemas/tools/index.json'."
    );
  }
}

function ensureHttpTransportUrls(manifest: Manifest): void {
  manifest.mcp.servers.forEach((definition, index) => {
    const transport = definition.server.transport;
    if (transport.type !== 'http') {
      return;
    }

    const rawUrl = transport.url;
    if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      throw new Error(
        `Le transport HTTP du serveur MCP #${index + 1} doit définir une URL absolue ou le placeholder ${HTTP_PUBLIC_URL_PLACEHOLDER}.`
      );
    }

    if (rawUrl === HTTP_PUBLIC_URL_PLACEHOLDER) {
      return;
    }

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(
          `Le transport HTTP du serveur MCP #${index + 1} doit utiliser le schéma http ou https (valeur actuelle: ${rawUrl}).`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Le transport HTTP')) {
        throw error;
      }
      throw new Error(
        `Le transport HTTP du serveur MCP #${index + 1} doit être une URL absolue valide (valeur actuelle: ${rawUrl}).`
      );
    }
  });
}

async function main(): Promise<void> {
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  let manifest: Manifest;

  try {
    manifest = JSON.parse(raw) as Manifest;
  } catch (error) {
    throw new Error(`Impossible de parser ${manifestPath} : ${(error as Error).message}`);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(manifestSchema);
  const valid = validate(manifest);

  if (!valid) {
    const messages = (validate.errors ?? []).map((err) => `${err.instancePath} ${err.message ?? ''}`.trim());
    throw new Error(`Le manifest est invalide :\n - ${messages.join('\n - ')}`);
  }

  ensureToolSchemaLinks(manifest);
  ensureHttpTransportUrls(manifest);
  console.log('Manifest valide ✅');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
