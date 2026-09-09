/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { z } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { parseNumberRangeString, safeChannelRangeTextSchema, userIdSchema } from '../../utils/validators';
import { buildToolResult, type ToolExecutionResult } from '../types';

const item = {
  number: z.coerce.number().int().min(1).max(99999),
  label: z.string().trim().min(1).max(128),
  channels: safeChannelRangeTextSchema
};
export const submasterPreparationSchema = z.object({ ...item, number: z.coerce.number().int().min(1).max(9999),
  level: z.coerce.number().finite().min(0).max(100).optional().describe('Si fourni, applique ce niveau aux canaux en Live avant enregistrement. Sinon conserve les valeurs courantes.'),
  intensity_only: z.boolean().default(true).describe('Enregistre uniquement l’intensite par defaut; false inclut les autres parametres courants.')
}).strict();
export const showPreparationSchema = {
  groups: z.array(z.object(item).strict()).max(500).optional(),
  color_palettes: z.array(z.object({ ...item,
    hue: z.coerce.number().finite().min(0).max(360).optional(),
    saturation: z.coerce.number().finite().min(0).max(100).optional(),
    use_current_values: z.boolean().optional()
  }).strict()).max(500).optional(),
  focus_palettes: z.array(z.object({ ...item,
    pan: z.coerce.number().finite().optional(), tilt: z.coerce.number().finite().optional(),
    use_current_values: z.boolean().optional(),
    description: z.string().max(256).optional().describe('Note descriptive uniquement; jamais interpretee comme une commande.')
  }).strict()).max(500).optional(),
  submasters: z.array(submasterPreparationSchema).max(500).optional(),
  dry_run: z.boolean().optional(), require_confirmation: z.boolean().optional(),
  targetAddress: z.string().min(1).optional(), targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  user: userIdSchema.optional(), verification_timeout_ms: z.coerce.number().int().min(50).max(10000).optional()
};
type Options = z.infer<ReturnType<typeof preparationObject>>;
function preparationObject() { return z.object(showPreparationSchema).strict(); }

export async function prepareShowObjects(raw: unknown, workflow: string): Promise<ToolExecutionResult> {
  const options: Options = preparationObject().parse(raw);
  const targets = [
    ...(options.groups ?? []).map((entry) => ({ ...entry, family: 'group', kind: 'Group' })),
    ...(options.color_palettes ?? []).map((entry) => ({ ...entry, family: 'cp', kind: 'Color_Palette' })),
    ...(options.focus_palettes ?? []).map((entry) => ({ ...entry, family: 'fp', kind: 'Focus_Palette' })),
    ...(options.submasters ?? []).map((entry) => ({ ...entry, family: 'sub', kind: 'Sub' }))
  ];
  if (targets.length === 0) throw new Error('Fournir au moins un groupe, une palette ou un submaster.');
  if (new Set(targets.map((entry) => `${entry.family}:${entry.number}`)).size !== targets.length) throw new Error('Numero de cible duplique dans le plan.');
  for (const entry of options.color_palettes ?? []) {
    if (entry.use_current_values !== true && (entry.hue === undefined || entry.saturation === undefined)) throw new Error('Chaque palette couleur exige hue+saturation ou use_current_values=true.');
  }
  for (const entry of options.focus_palettes ?? []) {
    if (entry.use_current_values !== true && (entry.pan === undefined || entry.tilt === undefined)) throw new Error('Chaque palette focus exige pan+tilt ou use_current_values=true. description reste une note.');
  }
  type Operation = { address: string; args: Array<{ type: string; value: string | number }>; target: string };
  const operations: Operation[] = [];
  const commandAddress = options.user === undefined ? '/eos/newcmd' : `/eos/user/${options.user}/newcmd`;
  for (const target of targets) {
    const channels = parseNumberRangeString(target.channels);
    const id = `${target.family}:${target.number}`;
    for (const channel of channels) {
      if ('hue' in target && typeof target.hue === 'number' && 'saturation' in target && typeof target.saturation === 'number') operations.push({ address: `/eos/chan/${channel}/color/hs`, args: [{ type: 'f', value: target.hue }, { type: 'f', value: target.saturation }], target: id });
      if ('pan' in target && typeof target.pan === 'number') operations.push({ address: `/eos/chan/${channel}/param/Pan`, args: [{ type: 'f', value: target.pan }], target: id });
      if ('tilt' in target && typeof target.tilt === 'number') operations.push({ address: `/eos/chan/${channel}/param/Tilt`, args: [{ type: 'f', value: target.tilt }], target: id });
      if ('level' in target && typeof target.level === 'number') operations.push({ address: `/eos/chan/${channel}`, args: [{ type: 'f', value: target.level }], target: id });
    }
    const filter = 'intensity_only' in target && target.intensity_only ? ' Intensity' : '';
    operations.push({ address: commandAddress, args: [{ type: 's', value: `Chan ${channels.join(' + ')}${filter} Record ${target.kind} ${target.number}#` }], target: id });
    operations.push({ address: `/eos/set/${target.family}/${target.number}/label`, args: [{ type: 's', value: target.label }], target: id });
  }
  const preview = operations.map((operation) => `${operation.address} ${JSON.stringify(operation.args.map((arg) => arg.value))}`);
  const common = { workflow, commands_preview: preview, plan: targets, verified: false };
  if (options.dry_run === true) return buildToolResult({ status: 'dry_run', summary: 'Preparation simulee; aucune commande envoyee.', commandsSent: [], structuredContent: { ...common, dry_run: true } });
  if (options.require_confirmation !== true) throw new Error('Confirmation explicite requise pour enregistrer ces cibles.');
  const client = getOscClient();
  const read = (target: typeof targets[number]) => client.requestJson(`/eos/get/${target.family}/${target.number}`, { targetAddress: options.targetAddress, targetPort: options.targetPort, timeoutMs: options.verification_timeout_ms ?? 2000 });
  // An explicit native empty-target reply distinguishes a free number from a failed read.
  for (const target of targets) {
    const response = await read(target);
    if ((response.data as { exists?: boolean } | null)?.exists !== false) throw new Error(`Cible ${target.family} ${target.number} deja presente ou lecture non confirmee. Choisir un numero libre; aucune ecriture.`);
  }
  const sent: string[] = [];
  const completed: string[] = [];
  try {
    for (const target of targets) {
      const id = `${target.family}:${target.number}`;
      for (const operation of operations.filter((entry) => entry.target === id)) {
        await client.sendMessage(operation.address, operation.args, options);
        sent.push(`${operation.address} ${JSON.stringify(operation.args.map((arg) => arg.value))}`);
      }
      const response = await read(target);
      const actual = response.data as { label?: string; channels?: number[] } | null;
      if (response.status !== 'ok' || actual?.label !== target.label) throw new Error(`Enregistrement/label non confirme pour ${id}.`);
      if (target.family !== 'sub') {
        const expected = parseNumberRangeString(target.channels);
        if (!actual.channels || expected.length !== actual.channels.length || expected.some((channel, index) => actual.channels![index] !== channel)) throw new Error(`Membres non conformes pour ${id}.`);
      }
      completed.push(id);
    }
    const completeGroupsOnly = targets.every((entry) => entry.family === 'group');
    return buildToolResult({ status: 'ok', summary: `${completed.length} cibles enregistrees; labels et membres disponibles relus.`, commandsSent: sent,
      structuredContent: { ...common, completed, verified: completeGroupsOnly,
        verified_fields: completeGroupsOnly ? ['label', 'channels'] : ['label', 'palette_channels'],
        limitations: completeGroupsOnly ? [] : ['OSC Get ne fournit pas les valeurs stockees des palettes et submasters. Leur contenu final reste a controler dans Eos.'],
        accepted_by_eos: null } });
  } catch (error) {
    return buildToolResult({ status: 'partial_failure', summary: 'Preparation interrompue; les cibles precedentes peuvent deja etre enregistrees.', commandsSent: sent, structuredContent: { ...common, completed, error: error instanceof Error ? error.message : String(error) } });
  }
}
