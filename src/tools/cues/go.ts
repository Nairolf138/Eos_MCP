import { z, type ZodRawShape } from 'zod';
import { validateCueArgumentsPair } from '../../utils/validators';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { createDryRunResult, resolveSafetyOptions } from '../common/safety';
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

const goInputSchema = {
  cuelist_number: cuelistNumberSchema,
  cue_number: cueNumberSchema.optional(),
  cue_part: cuePartSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_go
 * @summary GO sur liste de cues
 * @description Declenche un GO sur la liste de cues cible, optionnellement vers une cue precise.
 * @arguments Voir docs/tools.md#eos-cue-go pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-go pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-go pour un exemple OSC.
 */
export const eosCueGoTool: ToolDefinition<typeof goInputSchema> = {
  name: 'eos_cue_go',
  config: {
    title: 'GO sur liste de cues',
    description: 'Declenche un GO sur la liste de cues cible, optionnellement vers une cue precise.',
    inputSchema: goInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.go
      },
      highlighted: true
    }
  },
  handler: async (args) => {
    const schema = z.object(goInputSchema).strict().superRefine((value, ctx) => validateCueArgumentsPair(value, ctx));
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload(identifier);
    const oscArgs = buildJsonArgs(payload);
    const safety = resolveSafetyOptions(options);

    if (safety.dryRun) {
      return createDryRunResult({
        text: `GO simule sur ${formatCueDescription(identifier)}`,
        action: 'cue_go',
        request: payload,
        oscAddress: oscMappings.cues.go,
        oscArgs
      });
    }

    await client.sendMessage(oscMappings.cues.go, oscArgs, extractTargetOptions(options));

    return createCueCommandResult(
      'cue_go',
      identifier,
      payload,
      oscMappings.cues.go,
      {
        summary: `GO envoye sur ${formatCueDescription(identifier)}`
      }
    );
  }
};

export default eosCueGoTool;
