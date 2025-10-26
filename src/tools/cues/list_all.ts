import { z, type ZodRawShape } from 'zod';
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../../services/cache/index';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  buildCueCommandPayload,
  createCueIdentifierFromOptions,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  targetOptionsSchema
} from './common';
import { mapCueList } from './mappers';

const listAllInputSchema = {
  cuelist_number: cuelistNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_list_all
 * @summary Liste des cues
 * @description Recupere toutes les cues d'une liste avec leurs labels.
 * @arguments Voir docs/tools.md#eos-cue-list-all pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-list-all pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-list-all pour un exemple OSC.
 */
export const eosCueListAllTool: ToolDefinition<typeof listAllInputSchema> = {
  name: 'eos_cue_list_all',
  config: {
    title: 'Liste des cues',
    description: 'Recupere toutes les cues d\'une liste avec leurs labels.',
    inputSchema: listAllInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.list
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(listAllInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload({
      cuelistNumber: identifier.cuelistNumber,
      cueNumber: null,
      cuePart: null
    });

    const cacheKey = createCacheKey({
      address: oscMappings.cues.list,
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
        const response = await client.requestJson(oscMappings.cues.list, {
          payload,
          ...extractTargetOptions(options)
        });

        const cues = mapCueList(response.data, identifier);

        const listLabel = formatCueDescription({ ...identifier, cueNumber: null, cuePart: null });
        const text = `${listLabel}: ${cues.length} cue(s).`;

        const result: ToolExecutionResult = {
          content: [{ type: 'text', text }],
          structuredContent: {
            action: 'cue_list_all',
            status: response.status,
            request: payload,
            cues,
            osc: {
              address: oscMappings.cues.list,
              response: response.payload
            }
          }
        } as ToolExecutionResult;

        return result;
      }
    });
  }
};

export default eosCueListAllTool;
