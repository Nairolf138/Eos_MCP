/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { createDryRunResult, resolveSafetyOptions } from '../common/safety';
import type { ToolDefinition } from '../types';
import {
  buildCueSelectCommand,
  buildCueCommandPayload,
  createCueCommandResult,
  createCueIdentifierFromOptions,
  cueNumberSchema,
  cuePartSchema,
  cuelistNumberSchema,
  extractTargetOptions,
  buildCueSelectOscRequest,
  resolveCueOscMode,
  notifyCueResourceChange,
  formatCueDescription,
  targetOptionsSchema
} from './common';

const selectInputSchema = {
  cuelist_number: cuelistNumberSchema.optional(),
  cue_number: cueNumberSchema,
  cue_part: cuePartSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_select
 * @summary Selection de cue
 * @description Selectionne une cue dans la liste sans la declencher.
 * @arguments Voir docs/tools.md#eos-cue-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-select pour un exemple OSC.
 */
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
  handler: async (args, extra) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const identifier = createCueIdentifierFromOptions(options);
    const payload = buildCueCommandPayload(identifier, { defaultPart: 0 });
    const command = buildCueSelectCommand(identifier);
    const oscRequest = buildCueSelectOscRequest(identifier, command, resolveCueOscMode(extra));
    const safety = resolveSafetyOptions(options);

    if (safety.dryRun) {
      return createDryRunResult({
        text: `Selection simulee de ${formatCueDescription(identifier)}`,
        action: 'cue_select',
        request: payload,
        oscAddress: oscRequest.message.address,
        oscArgs: oscRequest.message.args ?? [],
        cli: oscRequest.command ? { text: oscRequest.command } : undefined
      });
    }

    await client.sendMessage(oscRequest.message.address, oscRequest.message.args ?? [], {
      ...extractTargetOptions(options),
      wireContract: oscRequest.contract
    });
    notifyCueResourceChange(identifier);

    return createCueCommandResult(
      'cue_select',
      identifier,
      payload,
      oscRequest.message.address,
      {
        summary: `Selection de ${formatCueDescription(identifier)}`
      },
      {
        oscArgs: oscRequest.message.args ?? [],
        request: { command, oscMode: oscRequest.mode, fallbackReason: oscRequest.fallbackReason ?? null },
        cli: oscRequest.command ? { text: oscRequest.command } : undefined
      }
    );
  }
};

export default eosCueSelectTool;
