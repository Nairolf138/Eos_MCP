/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../../services/cache/index';
import { getOscClient } from '../../services/osc/client';
import { buildCueJsonMessage } from '../../services/osc/messageBuilders';
import { oscMappings } from '../../services/osc/mappings';
import { buildReadConvention, buildToolResult, type ToolDefinition, type ToolExecutionResult } from '../types';
import {
  buildCueCommandPayload,
  createCueIdentifierFromOptions,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  targetOptionsSchema
} from './common';
import { mapCuelistInfo } from './mappers';

const cuelistInfoInputSchema = {
  cuelist_number: cuelistNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cuelist_get_info
 * @summary Informations de cuelist
 * @description Recupere les attributs d'une liste de cues (modes, flags...).
 * @arguments Voir docs/tools.md#eos-cuelist-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cuelist-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cuelist-get-info pour un exemple OSC.
 */
export const eosCuelistGetInfoTool: ToolDefinition<typeof cuelistInfoInputSchema> = {
  name: 'eos_cuelist_get_info',
  config: {
    title: 'Informations de cuelist',
    description: 'Recupere les attributs d\'une liste de cues (modes, flags...).',
    inputSchema: cuelistInfoInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.cuelistInfo
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(cuelistInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload({
      cuelistNumber: identifier.cuelistNumber,
      cueNumber: null,
      cuePart: null
    });

    const cacheKey = createCacheKey({
      address: oscMappings.cues.cuelistInfo,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'cuelists',
      key: cacheKey,
      tags: [
        createResourceTag('cuelists'),
        createResourceTag('cuelists', String(identifier.cuelistNumber))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const request = buildCueJsonMessage(oscMappings.cues.cuelistInfo, payload);
        const response = await client.requestBuiltJson(request, extractTargetOptions(options));

        const isComplete = response.status === 'ok';
        const info = isComplete ? mapCuelistInfo(response.data, identifier) : null;

        const listLabel = formatCueDescription({ ...identifier, cueNumber: null, cuePart: null });
        const text = info
          ? `${listLabel}: ${info.label ?? 'sans label'}`
          : `Lecture de ${listLabel} terminee avec le statut ${response.status}.`;

        const result: ToolExecutionResult = buildToolResult({
          text,
          status: response.status,
          summary: text,
          structuredContent: {
            action: 'cuelist_get_info',
            ...buildReadConvention({
              status: response.status,
              source: { type: 'eos_osc', address: oscMappings.cues.cuelistInfo, response: response.payload },
              error: response.error ?? null
            }),
            request: payload,
            ...(info ? { cuelist: info } : {}),
            osc: {
              address: oscMappings.cues.cuelistInfo,
              response: response.payload
            }
          }
        });

        return result;
      }
    });
  }
};

export default eosCuelistGetInfoTool;
