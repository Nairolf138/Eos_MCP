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

const getPendingCueInputSchema = {
  cuelist_number: cuelistNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_get_pending_cue
 * @summary Cue en attente
 * @description Recupere la prochaine cue en attente sur la liste specifiee (ou principale).
 * @arguments Voir docs/tools.md#eos-get-pending-cue pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-pending-cue pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-pending-cue pour un exemple OSC.
 */
export const eosGetPendingCueTool: ToolDefinition<typeof getPendingCueInputSchema> = {
  name: 'eos_get_pending_cue',
  config: {
    title: 'Cue en attente',
    description: 'Recupere la prochaine cue en attente sur la liste specifiee (ou principale).',
    inputSchema: getPendingCueInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.pending
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getPendingCueInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload({
      cuelistNumber: identifier.cuelistNumber,
      cueNumber: null,
      cuePart: null
    });

    const response = await client.requestJson(oscMappings.cues.pending, {
      payload,
      ...extractTargetOptions(options)
    });

    const state = mapCuePlaybackState(response.data, identifier);
    const text = `Cue en attente ${formatCueDescription(state.details.identifier)} (${state.details.label ?? 'sans label'})`;

    const result: ToolExecutionResult = {
      content: [
        { type: 'text', text },
        {
          type: 'object',
          data: {
            action: 'get_pending_cue',
            status: response.status,
            request: payload,
            cue: state,
            osc: {
              address: oscMappings.cues.pending,
              response: response.payload
            }
          }
        }
      ]
    } as ToolExecutionResult;

    return result;
  }
};

export default eosGetPendingCueTool;
