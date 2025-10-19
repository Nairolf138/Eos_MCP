import { z, type ZodRawShape } from 'zod';
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

    const response = await client.requestJson(oscMappings.cues.list, {
      payload,
      ...extractTargetOptions(options)
    });

    const cues = mapCueList(response.data, identifier);

    const listLabel = formatCueDescription({ ...identifier, cueNumber: null, cuePart: null });
    const text = `${listLabel}: ${cues.length} cue(s).`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cue_list_all',
            status: response.status,
            request: payload,
            cues,
            osc: {
              address: oscMappings.cues.list,
              response: response.payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCueListAllTool;
