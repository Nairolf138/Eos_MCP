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
import { mapCuelistInfo } from './mappers';

const cuelistInfoInputSchema = {
  cuelist_number: cuelistNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

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

    const response = await client.requestJson(oscMappings.cues.cuelistInfo, {
      payload,
      ...extractTargetOptions(options)
    });

    const info = mapCuelistInfo(response.data, identifier);

    const listLabel = formatCueDescription({ ...identifier, cueNumber: null, cuePart: null });
    const text = `${listLabel}: ${info.label ?? 'sans label'}`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cuelist_get_info',
            status: response.status,
            request: payload,
            cuelist: info,
            osc: {
              address: oscMappings.cues.cuelistInfo,
              response: response.payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCuelistGetInfoTool;
