/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { EOS_STRICT_MODE_ENV } from '../../config/env';
import { ETC_OSC_REFERENCE, NATIVE_GET_FAMILIES } from './nativeProtocol';

export type OscOfficialitySource = 'ETC Eos online OSC reference' | 'ETC Eos command-line via /eos/cmd' | 'Undocumented endpoint';
export interface OscAddressOfficiality {
  address: string;
  official: boolean;
  strictModeAllowed: boolean;
  source: OscOfficialitySource;
  notes: string;
}
function official(address: string): OscAddressOfficiality {
  return { address, official: true, strictModeAllowed: true,
    source: address.endsWith('/cmd') || address.endsWith('/newcmd') ? 'ETC Eos command-line via /eos/cmd' : 'ETC Eos online OSC reference',
    notes: `Documente par ETC: ${ETC_OSC_REFERENCE}. La validite du texte CLI et l'etat final sont des controles distincts.` };
}
const native = [
  '/eos/cmd', '/eos/newcmd', '/eos/user/{user}/cmd', '/eos/user/{user}/newcmd',
  '/eos/key/{key}', '/eos/user/{user}/key/{key}', '/eos/softkey/{index}', '/eos/chan', '/eos/chan/{channel}',
  '/eos/chan/{channel}/color/hs', '/eos/chan/{channel}/color/rgb', '/eos/chan/{channel}/param/{parameter}', '/eos/chan/{channel}/xyz',
  '/eos/addr', '/eos/addr/{address}', '/eos/addr/{address}/DMX', '/eos/addr/{address}/dmx',
  '/eos/group', '/eos/group/{group}', '/eos/group/{group}/level',
  '/eos/preset', '/eos/preset/fire', '/eos/macro', '/eos/macro/fire', '/eos/snap', '/eos/snap/fire', '/eos/curve', '/eos/pixmap', '/eos/ms', '/eos/fx',
  '/eos/wheel/{mode}/{parameter}', '/eos/wheel/{parameter}', '/eos/switch/{parameter}', '/eos/switch/{mode}/{parameter}',
  '/eos/color/hs', '/eos/color/rgb', '/eos/pantilt/xy', '/eos/xyz',
  '/eos/fader/{index}/config/{faders}', '/eos/fader/{index}/config/{page}/{faders}',
  '/eos/fader/{index}/{fader}', '/eos/fader/{index}/{fader}/load', '/eos/fader/{index}/{fader}/unload', '/eos/fader/{index}/page/{delta}',
  '/eos/ds/{index}/{button}', '/eos/ds/{index}/{target}/{buttons}', '/eos/ds/{index}/{target}/flexi/{buttons}',
  '/eos/ds/{index}/{target}/{page}/{buttons}', '/eos/ds/{index}/{target}/flexi/{page}/{buttons}', '/eos/ds/{index}/page/{delta}',
  '/eos/sub', '/eos/sub/{number}', '/eos/sub/fire', '/eos/sub/{number}/fire',
  '/eos/cue', '/eos/cue/{cuelist}', '/eos/cue/{cuelist}/{cue}', '/eos/cue/{cue}/fire', '/eos/cue/{cuelist}/{cue}/fire', '/eos/cue/{cuelist}/{cue}/{part}/fire', '/eos/cues/fire', '/eos/cues/{cuelist}/fire', '/eos/cues/stop', '/eos/cues/{cuelist}/stop',
  '/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}',
  '/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}/{offset}', '/eos/cuelist/{bank_index}/page/{delta}',
  '/eos/get/version', '/eos/get/setup', '/eos/get/show/path', '/eos/get/userlist', '/eos/get/session',
  '/eos/get/fpe/count', '/eos/get/fpe/{set}', '/eos/get/fpe/{set}/count', '/eos/get/fpe/{set}/{point}',
  '/eos/get/patch/count', '/eos/get/patch/index/{index}', '/eos/get/patch/{channel}', '/eos/get/patch/{channel}/{part}',
  '/eos/get/patch/{channel}/{part}/augment3d/position', '/eos/get/patch/{channel}/{part}/augment3d/beam',
  '/eos/get/cue/{cuelist}/count', '/eos/get/cue/{cuelist}/noparts/count', '/eos/get/cue/{cuelist}/index/{index}',
  '/eos/get/cue/{cuelist}/{cue}', '/eos/get/cue/{cuelist}/{cue}/{part}',
  '/eos/get/{palette_type}/{number}',
  '/eos/user', '/eos/ping', '/eos/reset', '/eos/subscribe', '/eos/subscribe/param/{parameter}',
  '/eos/out/cmd', '/eos/out/user/{number}/cmd', '/eos/out/ping', '/eos/out/event/state',
  '/eos/out/active/cue', '/eos/out/pending/cue', '/eos/out/active/wheel/{index}', '/eos/out/softkey/{index}',
  '/eos/set/patch/{channel}/label', '/eos/set/patch/{channel}/gel', '/eos/set/patch/{channel}/augment3d/position',
  '/eos/set/group/{number}/chans', '/eos/set/cue/{cuelist}/{number}/label', '/eos/set/cue/{cuelist}/{number}/{part}/label', '/eos/set/{palette_type}/{number}/label'
];
for (const family of NATIVE_GET_FAMILIES) {
  if (['cue', 'patch', 'fpe'].includes(family)) continue;
  native.push(`/eos/get/${family}/count`, `/eos/get/${family}/index/{index}`, `/eos/get/${family}/{number}`, `/eos/get/${family}/uid/{uid}`);
  native.push(`/eos/set/${family}/{number}/label`);
}
for (const palette of ['ip', 'fp', 'cp', 'bp']) native.push(`/eos/${palette}/fire`);
for (let field = 1; field <= 10; field++) native.push(`/eos/set/patch/{channel}/text${field}`);
export const OSC_ADDRESS_OFFICIALITY: readonly OscAddressOfficiality[] = [...new Set(native)].map(official);
function templateToRegExp(template: string): RegExp {
  const tokens: Record<string, string> = {
    key: '[A-Za-z0-9_ @.+\\-]+', parameter: '[A-Za-z0-9_ .%\\-]+', uid: '[A-Za-z0-9-]+',
    palette_type: '(?:ip|fp|cp|bp)', mode: '(?:coarse|fine)',
    target: '(?:chan|group|preset|sub|macro|ip|fp|cp|bp|fx|ms|snap|pixmap|curve|scene)',
    delta: '-?\\d+', user: '\\d{1,2}'
  };
  const parts = template.split(/(\{[^}]+\})/g).map((part) => part.startsWith('{')
    ? `(?:${tokens[part.slice(1, -1)] ?? '\\d+(?:\\.\\d+)?'})`
    : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('')}$`, template.startsWith('/eos/ds/') ? 'i' : '');
}
const exact = new Map(OSC_ADDRESS_OFFICIALITY.map((entry) => [entry.address, entry]));
const patterns = OSC_ADDRESS_OFFICIALITY.map((entry) => ({ entry, pattern: templateToRegExp(entry.address) }));
export function allowsUserScope(address: string): boolean {
  return /^\/eos\/(?:cmd|newcmd|key|softkey|chan|addr|group|ip|fp|cp|bp|preset|macro|snap|curve|pixmap|ms|fx|sub|cue|cues|wheel|switch|color|pantilt|xyz)(?:\/|$)/.test(address);
}
export function getOscAddressOfficiality(address: string): OscAddressOfficiality | undefined {
  const scoped = address.match(/^\/eos\/user\/(\d{1,2})(\/.*)$/);
  if (scoped && allowsUserScope(`/eos${scoped[2]}`)) return getOscAddressOfficiality(`/eos${scoped[2]}`);
  return exact.get(address) ?? patterns.find(({ pattern }) => pattern.test(address))?.entry;
}
export function isEosStrictModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[EOS_STRICT_MODE_ENV];
  return raw === undefined || raw.trim() === '' ? false : ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}
export function assertOscAddressStrictModeAllowed(address: string, _env: NodeJS.ProcessEnv = process.env): void {
  // All console traffic is native, irrespective of the command-text validation profile.
  if (address.startsWith('/eos/out/') || getOscAddressOfficiality(address)?.official !== true) {
    throw new Error(`Envoi refuse: '${address}' n'est pas une entree OSC ETC documentee et implementee.`);
  }
}
