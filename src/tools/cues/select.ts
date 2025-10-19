import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition } from '../types';
import {
  buildCueCommandPayload,
  buildJsonArgs,
  createCueCommandResult,
  createCueIdentifierFromOptions,
  cueNumberSchema,
  cuePartSchema,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  targetOptionsSchema
} from './common';

const selectInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema,
  cue_part: cuePartSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

export const eosCueSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_cue_select',
  config: {
    title: 'Selection de cue',
    description: 'Selectionne une cue dans la liste sans la declencher.',
    inputSchema: selectInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.select
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload(identifier, { defaultPart: 0 });

    client.sendMessage(oscMappings.cues.select, buildJsonArgs(payload), extractTargetOptions(options));

    return createCueCommandResult(
      'cue_select',
      identifier,
      payload,
      oscMappings.cues.select,
      {
        summary: `Selection de ${formatCueDescription(identifier)}`
      }
    );
  }
};

export default eosCueSelectTool;
