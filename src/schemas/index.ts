/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import toolDefinitions from '../tools/index';
import type { ToolDefinition, ToolMetadata } from '../tools/types';

export interface ToolJsonSchemaDefinition {
  name: string;
  title?: string;
  description?: string;
  uri: string;
  schema: Record<string, unknown>;
  metadata?: ToolMetadata;
}

type ZodToJsonSchema = (
  schema: ZodTypeAny,
  options: { name?: string; $refStrategy?: 'none' | 'root' }
) => Record<string, unknown>;

const toJsonSchema = zodToJsonSchema as ZodToJsonSchema;

function isWorkflowTool(definition: ToolDefinition): boolean {
  return definition.name.startsWith('eos_workflow_');
}

function toZodObject(shape: ZodRawShape | undefined, options: { passthrough: boolean }): z.ZodObject<ZodRawShape> {
  const objectSchema = z.object(shape ?? {});
  return options.passthrough ? objectSchema.passthrough() : objectSchema.strict();
}

function buildSchema(definition: ToolDefinition): ToolJsonSchemaDefinition {
  const zodSchema = toZodObject(definition.config.inputSchema, { passthrough: isWorkflowTool(definition) });
  const jsonSchema = toJsonSchema(zodSchema, {
    name: definition.name,
    $refStrategy: 'none'
  });

  const enrichedSchema: Record<string, unknown> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: definition.config.title ?? definition.name,
    description: definition.config.description,
    ...(definition.metadata ? { 'x-eos-metadata': definition.metadata } : {}),
    ...jsonSchema
  };

  return {
    name: definition.name,
    title: definition.config.title,
    description: definition.config.description,
    uri: `schema://tools/${definition.name}`,
    schema: enrichedSchema,
    metadata: definition.metadata
  };
}

export const toolJsonSchemas: ToolJsonSchemaDefinition[] = toolDefinitions.map((tool) =>
  buildSchema(tool)
);

export const toolJsonSchemaIndex = new Map<string, ToolJsonSchemaDefinition>(
  toolJsonSchemas.map((schema) => [schema.name, schema])
);

export function registerToolSchemas(server: McpServer): void {
  for (const schema of toolJsonSchemas) {
    server.registerResource(
      `tool-schema-${schema.name}`,
      schema.uri,
      {
        title: schema.title ?? schema.name,
        description: schema.description,
        mimeType: 'application/schema+json'
      },
      async (
        _uri: URL,
        _extra: RequestHandlerExtra<ServerRequest, ServerNotification>
      ) => {
        return {
          contents: [
            {
              uri: schema.uri,
              mimeType: 'application/schema+json',
              text: JSON.stringify(schema.schema, null, 2)
            }
          ]
        };
      }
    );
  }
}

export function getToolJsonSchema(name: string): ToolJsonSchemaDefinition | undefined {
  return toolJsonSchemaIndex.get(name);
}

export type { ToolDefinition };
