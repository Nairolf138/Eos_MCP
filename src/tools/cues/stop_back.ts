import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition } from '../types';
import {
  buildCueCommandPayload,
  buildJsonArgs,
  createCueCommandResult,
  createCueIdentifierFromOptions,
  cuelistNumberSchema,
  extractTargetOptions,
  formatCueDescription,
  targetOptionsSchema
} from './common';

const stopBackInputSchema = {
  cuelist_number: cuelistNumberSchema,
  back: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_stop_back
 * @summary Stop ou Back sur liste de cues
 * @description Stoppe la lecture de la liste ou effectue un back selon l'option fournie.
 * @arguments Voir docs/tools.md#eos-cue-stop-back pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-stop-back pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-stop-back pour un exemple OSC.
 */
export const eosCueStopBackTool: ToolDefinition<typeof stopBackInputSchema> = {
  name: 'eos_cue_stop_back',
  config: {
    title: 'Stop ou Back sur liste de cues',
    description: 'Stoppe la lecture de la liste ou effectue un back selon l\'option fournie.',
    inputSchema: stopBackInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.stopBack
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(stopBackInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload(identifier);

    if (options.back === true) {
      payload.back = true;
    }

    await client.sendMessage(oscMappings.cues.stopBack, buildJsonArgs(payload), extractTargetOptions(options));

    return createCueCommandResult(
      options.back ? 'cue_back' : 'cue_stop',
      identifier,
      payload,
      oscMappings.cues.stopBack,
      {
        summary: `${options.back ? 'Back' : 'Stop'} sur ${formatCueDescription(identifier)}`
      }
    );
  }
};

export default eosCueStopBackTool;
