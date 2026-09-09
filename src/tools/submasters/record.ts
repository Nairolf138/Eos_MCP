/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { z } from 'zod';
import { prepareShowObjects, showPreparationSchema, submasterPreparationSchema } from '../workflows/showPreparation';
import type { ToolDefinition } from '../types';
const schema = {
  ...submasterPreparationSchema.shape,
  user: showPreparationSchema.user,
  targetAddress: showPreparationSchema.targetAddress, targetPort: showPreparationSchema.targetPort,
  dry_run: z.boolean().optional(), require_confirmation: z.boolean().optional(),
  verification_timeout_ms: showPreparationSchema.verification_timeout_ms
};
/**
 * @tool eos_submaster_record
 * @summary Enregistrer un submaster selectif
 * @description Enregistre les canaux explicites sur un numero libre. Intensite seule par defaut; level modifie les niveaux Live si fourni. Controle le label, sans pretendre relire les valeurs stockees.
 * @arguments Voir docs/tools.md#eos-submaster-record.
 * @returns Resultat structure, apercu, commandes envoyees et limites de verification.
 * @example CLI Chan 101 + 102 Intensity Record Sub 11#
 * @example OSC /eos/newcmd "Chan 101 + 102 Intensity Record Sub 11#"
 */
export const eosSubmasterRecordTool: ToolDefinition<typeof schema> = {
  name: 'eos_submaster_record',
  config: { title: 'Enregistrer un submaster selectif', description: 'Enregistre sur un numero libre les canaux explicites. Intensite seule par defaut. level applique des niveaux Live; absent, conserve les niveaux courants. Preview puis confirmation; contenu final a verifier dans Eos.', inputSchema: schema,
    annotations: { mapping: { osc: ['/eos/newcmd', '/eos/set/sub/{number}/label', '/eos/get/sub/{number}'] } } },
  metadata: { category: 'submasters', riskLevel: 'dangerous', requiresConfirmation: true, defaultDryRun: true },
  handler: async (args) => {
    const { user, targetAddress, targetPort, dry_run, require_confirmation, verification_timeout_ms, ...sub } = z.object(schema).strict().parse(args);
    return prepareShowObjects({ submasters: [sub], user, targetAddress, targetPort, dry_run, require_confirmation, verification_timeout_ms }, 'eos_submaster_record');
  }
};
