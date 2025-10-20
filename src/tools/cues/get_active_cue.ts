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
import { mapCuePlaybackState } from './mappers';
import type { CueIdentifier } from './types';

const getActiveCueInputSchema = {
  cuelist_number: cuelistNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

function formatActiveText(identifier: CueIdentifier, progress: number | null): string {
  const progressText = progress != null ? `${Math.round(progress)}%` : 'progression inconnue';
  return `Cue active ${formatCueDescription(identifier)} (${progressText})`;
}

/**
 * @tool eos_get_active_cue
 * @summary Cue active
 * @description Recupere la cue actuellement en lecture sur la liste specifiee (ou principale).
 * @arguments Voir docs/tools.md#eos-get-active-cue pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-active-cue pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-active-cue pour un exemple OSC.
 */
export const eosGetActiveCueTool: ToolDefinition<typeof getActiveCueInputSchema> = {
  name: 'eos_get_active_cue',
  config: {
    title: 'Cue active',
    description: 'Recupere la cue actuellement en lecture sur la liste specifiee (ou principale).',
    inputSchema: getActiveCueInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.active
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getActiveCueInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload({
      cuelistNumber: identifier.cuelistNumber,
      cueNumber: null,
      cuePart: null
    });

    const response = await client.requestJson(oscMappings.cues.active, {
      payload,
      ...extractTargetOptions(options)
    });

    const state = mapCuePlaybackState(response.data, identifier);
    const text = formatActiveText(state.details.identifier, state.progressPercent);

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'get_active_cue',
            status: response.status,
            request: payload,
            cue: state,
            osc: {
              address: oscMappings.cues.active,
              response: response.payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosGetActiveCueTool;
