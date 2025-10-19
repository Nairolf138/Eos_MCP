import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  buildCueCommandPayload,
  createCueIdentifierFromOptions,
  cueNumberSchema,
  cuePartSchema,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  targetOptionsSchema
} from './common';
import { mapCueDetails } from './mappers';
import type { CueDetails, CueIdentifier } from './types';

const getInfoInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema,
  cue_part: cuePartSchema.optional(),
  fields: z.array(z.string().min(1)).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

function formatCueInfoText(details: CueDetails): string {
  const label = details.label ? `"${details.label}"` : 'sans label';
  const up = details.timings.up != null ? `${details.timings.up}s` : '—';
  const down = details.timings.down != null ? `${details.timings.down}s` : '—';
  return `Cue ${formatCueDescription(details.identifier)} ${label} (Up ${up} / Down ${down})`;
}

export const eosCueGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_cue_get_info',
  config: {
    title: 'Informations de cue',
    description: 'Recupere les informations detaillees d\'une cue (timings, flags, notes...).',
    inputSchema: getInfoInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.info
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const baseIdentifier = createCueIdentifierFromOptions(options);
    const identifier: CueIdentifier = {
      cuelistNumber: baseIdentifier.cuelistNumber,
      cueNumber: baseIdentifier.cueNumber,
      cuePart: baseIdentifier.cuePart ?? 0
    };

    const payload = buildCueCommandPayload(identifier, { defaultPart: 0 });
    if (options.fields?.length) {
      payload.fields = options.fields;
    }

    const response = await client.requestJson(oscMappings.cues.info, {
      payload,
      ...extractTargetOptions(options)
    });

    const details = mapCueDetails(response.data, identifier);

    const text = formatCueInfoText(details);

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'cue_get_info',
            status: response.status,
            request: payload,
            cue: details,
            osc: {
              address: oscMappings.cues.info,
              response: response.payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosCueGetInfoTool;
