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
import type { CueIdentifier } from './types';

const fireInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema,
  cue_part: cuePartSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

export const eosCueFireTool: ToolDefinition<typeof fireInputSchema> = {
  name: 'eos_cue_fire',
  config: {
    title: 'Declenchement de cue',
    description: 'Declenche immediatement une cue specifique dans une liste donnee.',
    inputSchema: fireInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.fire
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(fireInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const baseIdentifier = createCueIdentifierFromOptions(options);
    const identifier: CueIdentifier = {
      cuelistNumber: baseIdentifier.cuelistNumber,
      cueNumber: baseIdentifier.cueNumber,
      cuePart: baseIdentifier.cuePart ?? 0
    };

    const payload = buildCueCommandPayload(identifier, { defaultPart: 0 });

    client.sendMessage(oscMappings.cues.fire, buildJsonArgs(payload), extractTargetOptions(options));

    return createCueCommandResult(
      'cue_fire',
      identifier,
      payload,
      oscMappings.cues.fire,
      {
        summary: `Declenchement de ${formatCueDescription(identifier)}`
      }
    );
  }
};

export default eosCueFireTool;
