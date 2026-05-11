/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Ajv, { type JSONSchemaType } from 'ajv';
import { workflowTools } from '../src/tools/workflows/index';

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
        featured_workflows?: Array<{
          id: string;
          title: string;
          description: string;
          recommended?: boolean;
          primary_entry_point?: boolean;
          annotations?: Record<string, unknown>;
        }>;
        presentation_order?: string[];
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
                schema_base_path: { type: 'string', nullable: true },
                featured_workflows: {
                  type: 'array',
                  nullable: true,
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['id', 'title', 'description'],
                    properties: {
                      id: { type: 'string', minLength: 1 },
                      title: { type: 'string', minLength: 1 },
                      description: { type: 'string', minLength: 1 },
                      recommended: { type: 'boolean', nullable: true },
                      primary_entry_point: { type: 'boolean', nullable: true },
                      annotations: {
                        type: 'object',
                        nullable: true,
                        required: [],
                        additionalProperties: true
                      }
                    }
                  }
                },
                presentation_order: {
                  type: 'array',
                  nullable: true,
                  items: { type: 'string', minLength: 1 }
                }
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

function ensureUniqueValues(values: string[], context: string): void {
  const seen = new Set<string>();
  const duplicates = values.filter((value) => {
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    return false;
  });

  if (duplicates.length > 0) {
    throw new Error(`${context} contient des doublons: ${[...new Set(duplicates)].join(', ')}.`);
  }
}

function ensureWorkflowManifestCoherence(manifest: Manifest): void {
  const tools = manifest.mcp.capabilities.tools;
  const featuredWorkflows = tools?.featured_workflows ?? [];
  const presentationOrder = tools?.presentation_order ?? [];
  const exportedWorkflowIds = workflowTools.map((tool) => tool.name);
  const exportedWorkflowSet = new Set(exportedWorkflowIds);

  if (featuredWorkflows.length === 0) {
    throw new Error('Le manifest doit exposer les workflows recommandes dans mcp.capabilities.tools.featured_workflows.');
  }

  const featuredIds = featuredWorkflows.map((entry) => entry.id);
  ensureUniqueValues(featuredIds, 'mcp.capabilities.tools.featured_workflows');
  ensureUniqueValues(presentationOrder, 'mcp.capabilities.tools.presentation_order');

  const unknownFeaturedIds = featuredIds.filter((id) => !exportedWorkflowSet.has(id));
  if (unknownFeaturedIds.length > 0) {
    throw new Error(
      `Le manifest reference des workflows non exportes par workflowTools: ${unknownFeaturedIds.join(', ')}.`
    );
  }

  const unknownPresentationIds = presentationOrder.filter((id) => !exportedWorkflowSet.has(id));
  if (unknownPresentationIds.length > 0) {
    throw new Error(
      `mcp.capabilities.tools.presentation_order reference des workflows non exportes: ${unknownPresentationIds.join(', ')}.`
    );
  }

  const missingExportedWorkflowIds = exportedWorkflowIds.filter((id) => !presentationOrder.includes(id));
  if (missingExportedWorkflowIds.length > 0) {
    throw new Error(
      `mcp.capabilities.tools.presentation_order doit inclure tous les workflowTools exportes: ${missingExportedWorkflowIds.join(', ')}.`
    );
  }

  const featuredPrefix = presentationOrder.slice(0, featuredIds.length);
  if (featuredPrefix.join('\n') !== featuredIds.join('\n')) {
    throw new Error(
      'mcp.capabilities.tools.presentation_order doit commencer par les workflows recommandes, dans le meme ordre que featured_workflows.'
    );
  }

  featuredWorkflows.forEach((entry) => {
    if (entry.title.trim().length === 0 || entry.description.trim().length === 0) {
      throw new Error(`Le workflow ${entry.id} doit definir title et description dans le manifest.`);
    }

    if (entry.recommended !== true || entry.primary_entry_point !== true) {
      throw new Error(`Le workflow ${entry.id} doit etre marque recommended et primary_entry_point dans le manifest.`);
    }

    const annotations = entry.annotations ?? {};
    if (annotations.recommended !== true || annotations.primaryEntryPoint !== true) {
      throw new Error(
        `Le workflow ${entry.id} doit exposer les annotations recommended et primaryEntryPoint pour les clients compatibles.`
      );
    }
  });
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
  ensureWorkflowManifestCoherence(manifest);
  ensureHttpTransportUrls(manifest);
  console.log('Manifest valide ✅');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
