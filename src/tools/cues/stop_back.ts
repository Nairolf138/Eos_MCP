import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { createDryRunResult, resolveSafetyOptions } from '../common/safety';
import type { ToolDefinition } from '../types';
import {
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
        osc: oscMappings.cues.stopBackCommand,
        commandExample: 'Cue {cuelist_number} Stop#'
      },
      highlighted: true
    }
  },
  handler: async (args) => {
    const schema = z.object(stopBackInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const listNumber = identifier.cuelistNumber;
    if (listNumber == null) {
      throw new Error('Numero de liste de cues manquant apres validation.');
    }

    const action = options.back ? 'cue_back' : 'cue_stop';
    const command = `Cue ${listNumber} ${options.back ? 'Back#' : 'Stop#'}`;
    const safety = resolveSafetyOptions(options);

    if (safety.dryRun) {
      return createDryRunResult({
        text: `${options.back ? 'Back' : 'Stop'} simule sur ${formatCueDescription(identifier)}`,
        action,
        request: { command },
        oscAddress: oscMappings.cues.stopBackCommand,
        oscArgs: [
          {
            type: 's',
            value: command
          }
        ],
        cli: { text: command }
      });
    }

    await client.sendCommand(command, extractTargetOptions(options));

    return createCueCommandResult(
      action,
      identifier,
      { command },
      oscMappings.cues.stopBackCommand,
      {
        summary: `${options.back ? 'Back' : 'Stop'} sur ${formatCueDescription(identifier)}`
      },
      {
        oscArgs: [
          {
            type: 's',
            value: command
          }
        ],
        cli: {
          text: command
        }
      }
    );
  }
};

export default eosCueStopBackTool;
