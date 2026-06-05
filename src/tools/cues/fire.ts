/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { assertSensitiveActionAllowed, createDryRunResult, resolveSafetyOptions } from '../common/safety';
import type { ToolDefinition } from '../types';
import {
  buildCueFireCommand,
  buildCueCommandPayload,
  createCueCommandResult,
  createCueIdentifierFromOptions,
  cueNumberSchema,
  cuePartSchema,
  cuelistNumberSchema,
  extractTargetOptions,
  buildCueFireOscRequest,
  resolveCueOscMode,
  notifyCueResourceChange,
  formatCueDescription,
  targetOptionsSchema
} from './common';
import type { CueIdentifier } from './types';

const fireInputSchema = {
  cuelist_number: cuelistNumberSchema.optional(),
  cue_number: cueNumberSchema,
  cue_part: cuePartSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_fire
 * @summary Declenchement de cue
 * @description Declenche immediatement une cue specifique dans une liste donnee.
 * @arguments Voir docs/tools.md#eos-cue-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-fire pour un exemple OSC.
 */
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
  handler: async (args, extra) => {
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
    const command = buildCueFireCommand(identifier);
    const oscRequest = buildCueFireOscRequest(identifier, command, resolveCueOscMode(extra));
    const safety = resolveSafetyOptions(options);

    if (safety.dryRun) {
      return createDryRunResult({
        text: `Declenchement simule de ${formatCueDescription(identifier)}`,
        action: 'cue_fire',
        request: payload,
        oscAddress: oscRequest.message.address,
        oscArgs: oscRequest.message.args ?? []
      });
    }

    assertSensitiveActionAllowed(options, 'eos_cue_fire');

    await client.sendMessage(oscRequest.message.address, oscRequest.message.args ?? [], {
      ...extractTargetOptions(options),
      wireContract: oscRequest.contract
    });
    notifyCueResourceChange(identifier);

    return createCueCommandResult(
      'cue_fire',
      identifier,
      payload,
      oscRequest.message.address,
      {
        summary: `Declenchement de ${formatCueDescription(identifier)}`
      },
      {
        oscArgs: oscRequest.message.args ?? [],
        request: { command, oscMode: oscRequest.mode, fallbackReason: oscRequest.fallbackReason ?? null },
        cli: oscRequest.command ? { text: oscRequest.command } : undefined
      }
    );
  }
};

export default eosCueFireTool;
