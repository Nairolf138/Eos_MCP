/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { EOS_STRICT_MODE_ENV } from '../../config/env';

export type OscOfficialitySource =
  | 'ETC Eos OSC manual v3.0.0'
  | 'ETC Eos command-line via /eos/cmd'
  | 'MCP transport contract'
  | 'MCP extension'
  | 'Undocumented endpoint';

export interface OscAddressOfficiality {
  address: string;
  official: boolean;
  strictModeAllowed: boolean;
  source: OscOfficialitySource;
  notes: string;
}

const OFFICIAL_NOTES = 'Adresse OSC ETC documentee dans le manuel Eos OSC v3.0.0.';
const COMMAND_NOTES = 'Adresse officielle de ligne de commande ETC; la semantique precise est portee par la commande texte envoyee.';
const MCP_RUNTIME_NOTES = 'Adresse necessaire a la negociation/runtime MCP; autorisee en mode strict meme si elle ne correspond pas a une commande pupitre ETC documentee.';
const EXTENSION_NOTES = 'Extension MCP non documentee comme commande OSC ETC; bloquee lorsque EOS_STRICT_MODE=true.';
const UNDOCUMENTED_NOTES = 'Endpoint utilise par compatibilite ou lecture explicite MCP, non documente comme commande OSC ETC; bloque lorsque EOS_STRICT_MODE=true.';

function official(address: string, notes = OFFICIAL_NOTES): OscAddressOfficiality {
  return { address, official: true, strictModeAllowed: true, source: 'ETC Eos OSC manual v3.0.0', notes };
}

function command(address: string): OscAddressOfficiality {
  return { address, official: true, strictModeAllowed: true, source: 'ETC Eos command-line via /eos/cmd', notes: COMMAND_NOTES };
}

function runtime(address: string): OscAddressOfficiality {
  return { address, official: false, strictModeAllowed: true, source: 'MCP transport contract', notes: MCP_RUNTIME_NOTES };
}

function extension(address: string): OscAddressOfficiality {
  return { address, official: false, strictModeAllowed: false, source: 'MCP extension', notes: EXTENSION_NOTES };
}

function undocumented(address: string): OscAddressOfficiality {
  return { address, official: false, strictModeAllowed: false, source: 'Undocumented endpoint', notes: UNDOCUMENTED_NOTES };
}

export const OSC_ADDRESS_OFFICIALITY: readonly OscAddressOfficiality[] = [
  command('/eos/cmd'),
  command('/eos/newcmd'),
  extension('/eos/get/cmd_line'),
  official('/eos/out/cmd'),
  official('/eos/out/user/{number}/cmd'),
  official('/eos/key'),
  official('/eos/key/{key}'),
  official('/eos/softkey/{index}'),
  undocumented('/eos/get/softkey_labels'),
  official('/eos/chan'),
  official('/eos/chan/{channel}/param/{parameter}'),
  undocumented('/eos/get/channels'),
  official('/eos/addr'),
  official('/eos/addr/{address}'),
  official('/eos/addr/{address}/DMX'),
  extension('/eos/dmx/address/select'),
  extension('/eos/dmx/address/level'),
  extension('/eos/dmx/address/dmx'),
  official('/eos/group'),
  official('/eos/group/{group}/level'),
  official('/eos/get/group'),
  official('/eos/get/group/count'),
  official('/eos/get/group/list'),
  official('/eos/ip/fire'),
  official('/eos/fp/fire'),
  official('/eos/cp/fire'),
  official('/eos/bp/fire'),
  official('/eos/get/palette'),
  official('/eos/get/ip'),
  official('/eos/get/fp'),
  official('/eos/get/cp'),
  official('/eos/get/bp'),
  official('/eos/get/ip/count'),
  official('/eos/get/fp/count'),
  official('/eos/get/cp/count'),
  official('/eos/get/bp/count'),
  official('/eos/get/ip/list'),
  official('/eos/get/fp/list'),
  official('/eos/get/cp/list'),
  official('/eos/get/bp/list'),
  official('/eos/preset/fire'),
  official('/eos/preset'),
  official('/eos/get/preset'),
  official('/eos/get/preset/count'),
  official('/eos/get/preset/list'),
  official('/eos/macro/fire'),
  official('/eos/macro'),
  official('/eos/get/macro'),
  official('/eos/get/macro/count'),
  official('/eos/get/macro/list'),
  official('/eos/snap'),
  official('/eos/get/snapshot'),
  official('/eos/get/snapshot/count'),
  official('/eos/get/snapshot/list'),
  official('/eos/curve/select'),
  official('/eos/get/curve'),
  official('/eos/get/curve/count'),
  official('/eos/get/curve/list'),
  official('/eos/get/effect'),
  official('/eos/get/effect/count'),
  official('/eos/get/effect/list'),
  official('/eos/param/wheel/tick'),
  official('/eos/param/wheel/rate'),
  official('/eos/param/color/hs'),
  official('/eos/param/color/rgb'),
  official('/eos/param/position/xy'),
  official('/eos/param/position/xyz'),
  official('/eos/get/active/wheels'),
  official('/eos/fader'),
  official('/eos/fader/{index}/config/{faders}/{page}'),
  official('/eos/fader/{index}/{page}/{fader}'),
  official('/eos/fader/{index}/page/{delta}'),
  official('/eos/ds/{index}/button/{page}/{button}'),
  official('/eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page}'),
  official('/eos/ds/{index}/page/{delta}'),
  official('/eos/pixmap'),
  official('/eos/get/pixmap'),
  official('/eos/get/pixmap/count'),
  official('/eos/get/pixmap/list'),
  official('/eos/ms'),
  official('/eos/get/magic_sheet'),
  official('/eos/get/magic_sheet/count'),
  official('/eos/get/magic_sheet/list'),
  official('/eos/sub'),
  official('/eos/get/submaster'),
  official('/eos/get/submaster/count'),
  official('/eos/get/submaster/list'),
  official('/eos/get/cue'),
  official('/eos/get/cue/count'),
  official('/eos/get/cue/list'),
  official('/eos/get/cuelist'),
  official('/eos/get/cuelist/count'),
  official('/eos/get/cuelist/list'),
  official('/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}'),
  official('/eos/cuelist/{bank_index}/page/{delta}'),
  official('/eos/get/version'),
  official('/eos/user'),
  official('/eos/ping'),
  official('/eos/reset'),
  official('/eos/subscribe'),
  runtime('/eos/handshake'),
  runtime('/eos/handshake/reply'),
  runtime('/eos/protocol/select'),
  runtime('/eos/protocol/select/reply'),
  runtime('/eos/out/ping'),
  runtime('/eos/reset/reply'),
  runtime('/eos/subscribe/reply'),
  runtime('/eos/out/{path}'),
  undocumented('/eos/get/fpe/set/count'),
  undocumented('/eos/get/fpe/set'),
  undocumented('/eos/get/fpe/point'),
  undocumented('/eos/get/patch/chan_info'),
  extension('/eos/get/patch/chan_pos'),
  extension('/eos/get/patch/chan_beam'),
  undocumented('/eos/get/cuelist/info'),
  undocumented('/eos/get/active/cue'),
  undocumented('/eos/get/pending/cue'),
  undocumented('/eos/get/show/name'),
  undocumented('/eos/get/live/blind'),
  undocumented('/eos/get/setup_defaults')
] as const;

function templateToRegExp(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\\\{[^/]+\\\}/g, '[^/]+');
  return new RegExp(`^${pattern}$`);
}

const EXACT_ENTRIES = new Map(OSC_ADDRESS_OFFICIALITY.map((entry) => [entry.address, entry]));
const TEMPLATE_ENTRIES = OSC_ADDRESS_OFFICIALITY
  .filter((entry) => entry.address.includes('{'))
  .map((entry) => ({ entry, pattern: templateToRegExp(entry.address) }));

export function getOscAddressOfficiality(address: string): OscAddressOfficiality | undefined {
  return EXACT_ENTRIES.get(address) ?? TEMPLATE_ENTRIES.find(({ pattern }) => pattern.test(address))?.entry;
}

export function isEosStrictModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[EOS_STRICT_MODE_ENV];
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function assertOscAddressStrictModeAllowed(address: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!isEosStrictModeEnabled(env)) {
    return;
  }

  const classification = getOscAddressOfficiality(address);
  if (classification?.strictModeAllowed === true) {
    return;
  }

  const source = classification?.source ?? 'adresse non classee';
  const notes = classification?.notes ?? 'Aucune entree dans OSC_ADDRESS_OFFICIALITY.';
  throw new Error(
    `EOS_STRICT_MODE bloque l'envoi OSC vers '${address}' (${source}). ${notes}`
  );
}
