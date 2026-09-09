/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { resolveFixture } from '../../fixtures';
import { getOscClient } from '../../services/osc/client';
import { toAbsoluteDmxAddress } from '../../services/osc/addressBuilders';
import { buildToolResult, type ToolExecutionResult } from '../types';

export interface PatchSequenceTargetOptions {
  user?: number;
  targetAddress?: string;
  targetPort?: number;
  verification_timeout_ms?: number;
  allow_readdress?: boolean;
}
export interface PatchSequenceBuildOptions extends PatchSequenceTargetOptions {
  channel_number: number;
  dmx_address: string;
  label: string;
  device_type?: string;
  fixture_query?: string;
  fixture_manufacturer?: string;
  fixture_model?: string;
  fixture_name?: string;
  fixture_mode?: string;
  dmx_footprint?: number;
  eos_profile?: string;
  part?: number;
  position_x?: number;
  position_y?: number;
  position_z?: number;
}
export interface PatchSequenceCommandStep { step: string; command: string }
export interface PatchSequenceStepLog { step: string; status: 'ok' | 'error'; command: string; error?: string }
export interface PatchPlan {
  channel: number; part: number; start: number; end: number; footprint: number; label: string;
  dimmer: boolean; eos_profile: string | null; position?: { x: number; y: number; z: number };
}
const normalise = (text: string): string => text.trim().toLowerCase().replace(/[_\s]+/g, ' ');
export function extractPatchSequenceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function buildPatchSequence(options: PatchSequenceBuildOptions): {
  commands: PatchSequenceCommandStep[]; fixtureResolution: ReturnType<typeof resolveFixture> | null; plan: PatchPlan;
} {
  if ((options.part ?? 1) !== 1) throw new Error('Creation automatique limitee a la partie 1. Preparer les canaux multipart dans Eos.');
  if (!Number.isInteger(options.channel_number) || options.channel_number < 1 || options.channel_number > 99999) throw new Error('Numero de canal invalide.');
  const requested = options.eos_profile ?? options.device_type ?? options.fixture_query ?? '';
  const dimmer = /^(dimmer|generic dimmer|trad|traditional|conventionnel)$/i.test(requested);
  let fixtureResolution: ReturnType<typeof resolveFixture> | null = null;
  if (!dimmer && !options.dmx_footprint && !options.device_type) {
    if (!options.fixture_mode) throw new Error('Preciser fixture_mode et sa dmx_footprint; aucun mode de projecteur ne doit etre devine.');
    fixtureResolution = resolveFixture({ fixtureQuery: options.fixture_query, fixtureManufacturer: options.fixture_manufacturer,
      fixtureModel: options.fixture_model, fixtureName: options.fixture_name, fixtureMode: options.fixture_mode });
  }
  const footprint = options.dmx_footprint ?? (dimmer ? 1 : fixtureResolution?.mode.dmx_footprint ?? fixtureResolution?.mode.channels);
  if (!Number.isInteger(footprint) || !footprint || footprint < 1 || footprint > 512) throw new Error('Empreinte DMX exacte (1..512) requise.');
  if (dimmer && footprint !== 1) throw new Error('Un dimmer utilise exactement une adresse DMX.');
  const start = toAbsoluteDmxAddress(options.dmx_address);
  const end = start + footprint - 1;
  if (Math.floor((start - 1) / 512) !== Math.floor((end - 1) / 512)) throw new Error('Le projecteur depasserait la fin de son univers DMX.');
  const coords = [options.position_x, options.position_y, options.position_z];
  if (coords.some((value) => value !== undefined) && !coords.every((value) => typeof value === 'number' && Number.isFinite(value))) throw new Error('Fournir les trois coordonnees XYZ ensemble.');
  const plan: PatchPlan = { channel: options.channel_number, part: 1, start, end, footprint, label: options.label,
    dimmer, eos_profile: dimmer ? null : options.eos_profile ?? options.device_type ?? null,
    ...(coords.every((value) => value !== undefined) ? { position: { x: coords[0]!, y: coords[1]!, z: coords[2]! } } : {}) };
  return { plan, fixtureResolution, commands: [
    { step: 'open_patch', command: '/eos/user/<user>/key/open_dmx_patch [1, 0]' },
    { step: 'patch_fixture', command: `Address ${start} At ${plan.channel} Part 1#` },
    { step: 'label_fixture', command: `/eos/set/patch/${plan.channel}/label ${JSON.stringify(plan.label)}` },
    ...(plan.position ? [{ step: 'set_3d_position', command: `/eos/set/patch/${plan.channel}/augment3d/position (XYZ demandes; orientation preservee)` }] : [])
  ] };
}

/** All rows are checked before the first write. Only native readback can establish patch success. */
export async function applyPatchPlans(plans: PatchPlan[], options: PatchSequenceTargetOptions & { dry_run?: boolean; require_confirmation?: boolean }, workflow: string): Promise<ToolExecutionResult> {
  const seen = new Set<number>();
  for (const plan of plans) {
    if (seen.has(plan.channel)) throw new Error(`Canal ${plan.channel} duplique dans le plan.`);
    seen.add(plan.channel);
    if (plans.some((other) => other !== plan && plan.start <= other.end && other.start <= plan.end)) throw new Error(`Collision DMX dans le plan, canal ${plan.channel}.`);
  }
  const preview = plans.flatMap((plan) => [
    `/eos/user/${options.user ?? '<user>'}/key/open_dmx_patch [1, 0]`,
    `/eos/user/${options.user ?? '<user>'}/newcmd ${JSON.stringify(`Address ${plan.start} At ${plan.channel} Part 1#`)}`,
    `/eos/set/patch/${plan.channel}/label ${JSON.stringify(plan.label)}`,
    ...(plan.position ? [`/eos/set/patch/${plan.channel}/augment3d/position ${JSON.stringify(plan.position)} (orientation relue)`] : [])
  ]);
  const resultBase = { workflow, plan: plans, commands_preview: preview,
    limitations: ['OFL aide a preparer le plan; il ne cree pas les profils Eos. Les appareils complexes doivent avoir leur type exact prepare sur leurs canaux dans Eos.'] };
  if (options.dry_run === true) return buildToolResult({ status: 'dry_run', summary: 'Plan de patch controle localement; aucune ecriture. Le patch existant sera relu avant execution.', commandsSent: [], structuredContent: { ...resultBase, dry_run: true, verified: false, preflight_console: 'not_run' } });
  if (options.require_confirmation !== true) throw new Error('Confirmation explicite requise pour appliquer le patch.');
  if (!options.user || options.user > 99) throw new Error('Le patch exige un utilisateur OSC dedie, user entre 1 et 99.');
  const client = getOscClient();
  const read = (address: string) => client.requestJson(address, { targetAddress: options.targetAddress, targetPort: options.targetPort, timeoutMs: options.verification_timeout_ms ?? 5000 });
  const snapshot = await read('/eos/get/patch/index/{index}');
  if (snapshot.status !== 'ok') throw new Error(`Preflight patch incomplet: ${snapshot.error ?? snapshot.status}. Aucune ecriture.`);
  const records = ((snapshot.data as { items?: Record<string, unknown>[] })?.items ?? []).slice();
  for (const item of [...records]) {
    const count = Number(item.part_count);
    if (!Number.isInteger(count) || count < 1) throw new Error('Nombre de parties inconnu; preflight refuse.');
    for (let part = 2; part <= count; part++) {
      const extra = await read(`/eos/get/patch/${item.channel_number}/${part}`);
      if (extra.status !== 'ok') throw new Error('Lecture multipart incomplete; preflight refuse.');
      records.push(extra.data as Record<string, unknown>);
    }
  }
  for (const plan of plans) {
    const existing = records.find((item) => item.channel_number === plan.channel && item.part_number === 1);
    if (existing && Number(existing.part_count) !== 1) throw new Error(`Canal ${plan.channel} multipart: modification automatique refusee.`);
    if (!plan.dimmer && (!existing || !plan.eos_profile || normalise(String(existing.model)) !== normalise(plan.eos_profile))) throw new Error(`Canal ${plan.channel}: preparer le profil Eos puis fournir eos_profile exactement comme le champ model de sa lecture OSC.`);
    if (plan.dimmer && existing && !/dimmer/i.test(String(existing.model))) throw new Error(`Canal ${plan.channel}: le profil existant n’est pas un dimmer.`);
    if (existing && Number(existing.address) > 0 && Number(existing.address) !== plan.start && options.allow_readdress !== true) throw new Error(`Canal ${plan.channel} deja adresse; allow_readdress=true requis pour le deplacer.`);
    for (const item of records) {
      const start = Number(item.address); if (start === 0) continue;
      const end = Number(item.ending_address);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) throw new Error(`Empreinte du canal ${item.channel_number} inconnue; collision impossible a exclure.`);
      if (item.channel_number === plan.channel) {
        if (end - start + 1 !== plan.footprint) throw new Error(`Empreinte du canal ${plan.channel} differente du plan.`);
      } else if (plan.start <= end && start <= plan.end) throw new Error(`Collision avec canal ${item.channel_number}: adresses ${start}..${end}.`);
    }
  }
  const commandsSent: string[] = [];
  const completed: number[] = [];
  try {
    await client.sendMessage(`/eos/user/${options.user}/key/open_dmx_patch`, [{ type: 'f', value: 1 }], options);
    await client.sendMessage(`/eos/user/${options.user}/key/open_dmx_patch`, [{ type: 'f', value: 0 }], options);
    for (const plan of plans) {
      const command = `Address ${plan.start} At ${plan.channel} Part 1#`;
      await client.sendNewCommand(command, options); commandsSent.push(command);
      const patched = await read(`/eos/get/patch/${plan.channel}/1`);
      const actual = patched.data as Record<string, unknown> | null;
      if (patched.status !== 'ok' || actual?.address !== plan.start || actual?.ending_address !== plan.end || (!plan.dimmer && normalise(String(actual.model)) !== normalise(plan.eos_profile!))) throw new Error(`Adresse ou profil non confirme pour canal ${plan.channel}.`);
      await client.sendMessage(`/eos/set/patch/${plan.channel}/label`, [{ type: 's', value: plan.label }], options);
      commandsSent.push(`/eos/set/patch/${plan.channel}/label ${JSON.stringify(plan.label)}`);
      if (plan.position) {
        const pose = await read(`/eos/get/patch/${plan.channel}/1/augment3d/position`);
        const orientation = (pose.data as { orientation?: { x: number; y: number; z: number } })?.orientation;
        if (pose.status !== 'ok' || !orientation || !Object.values(orientation).every(Number.isFinite)) throw new Error('Orientation Augment3d inconnue; position non modifiee.');
        await client.sendMessage(`/eos/set/patch/${plan.channel}/augment3d/position`, [plan.position.x, plan.position.y, plan.position.z, orientation.x, orientation.y, orientation.z].map((value) => ({ type: 'f', value })), options);
        commandsSent.push(`/eos/set/patch/${plan.channel}/augment3d/position`);
        const checkPose = await read(`/eos/get/patch/${plan.channel}/1/augment3d/position`);
        const position = (checkPose.data as { position?: Record<string, number> })?.position;
        if (checkPose.status !== 'ok' || !position || Object.entries(plan.position).some(([key, value]) => Math.abs(position[key] - value) > 0.001)) throw new Error('Position Augment3d non confirmee.');
      }
      const check = await read(`/eos/get/patch/${plan.channel}/1`);
      if (check.status !== 'ok' || (check.data as { label?: unknown })?.label !== plan.label) throw new Error(`Label non confirme pour canal ${plan.channel}.`);
      completed.push(plan.channel);
    }
    return buildToolResult({ status: 'ok', summary: `${completed.length} canaux patches et relus dans Eos.`, commandsSent, structuredContent: { ...resultBase, completed_channels: completed, verified: true, preflight_console: 'complete' } });
  } catch (error) {
    return buildToolResult({ status: 'partial_failure', summary: 'Patch interrompu; examiner les canaux deja modifies avant toute reprise.', commandsSent, structuredContent: { ...resultBase, completed_channels: completed, verified: false, error: extractPatchSequenceError(error) } });
  }
}

/** Compatibility entry point: execution requires the complete plan and preflight, not arbitrary CLI. */
export async function executePatchSequence(_commands: PatchSequenceCommandStep[], _options: PatchSequenceTargetOptions): Promise<{ steps: PatchSequenceStepLog[]; partialErrors: Array<{ step: string; error: string }>; success: boolean }> {
  throw new Error('Utiliser applyPatchPlans pour beneficier du controle complet du patch.');
}
