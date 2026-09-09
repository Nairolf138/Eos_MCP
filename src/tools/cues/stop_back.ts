/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { buildCueStopBackAddress } from '../../services/osc/addressBuilders';
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
  notifyCueResourceChange,
  formatCueDescription,
  targetOptionsSchema
} from './common';

const stopBackInputSchema = {
  cuelist_number: cuelistNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_cue_stop_back
 * @summary Stop ou Back sur liste de cues
 * @description Stoppe un fondu en cours; sinon recule d'une cue, selon l'etat Eos.
 * @arguments Voir docs/tools.md#eos-cue-stop-back pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-cue-stop-back pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-cue-stop-back pour un exemple OSC.
 */
export const eosCueStopBackTool: ToolDefinition<typeof stopBackInputSchema> = {
  name: 'eos_cue_stop_back',
  config: {
    title: 'Stop ou Back sur liste de cues',
    description: 'Appuie une fois sur Stop/Back pour la liste indiquee. Eos arrete un fondu en cours; sinon recule d’une cue. Le protocole ne fournit pas ici de commande Stop-seulement ou Back-seulement.',
    inputSchema: stopBackInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.cues.stopBackCommand
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

    const action = 'cue_stop_back';
    const address = buildCueStopBackAddress(listNumber);
    const safety = resolveSafetyOptions(options);

    if (safety.dryRun) {
      return createDryRunResult({
        text: `Stop/Back simule sur ${formatCueDescription(identifier)}`,
        action,
        request: { cuelist: listNumber },
        oscAddress: address,
        oscArgs: []
      });
    }

    await client.sendMessage(address, [], extractTargetOptions(options));
    notifyCueResourceChange(identifier);

    return createCueCommandResult(
      action,
      identifier,
      { cuelist: listNumber },
      address,
      {
        summary: `Stop/Back envoye sur ${formatCueDescription(identifier)}; resultat dependant du fondu en cours.`
      },
      {
        oscArgs: []
      }
    );
  }
};

export default eosCueStopBackTool;
