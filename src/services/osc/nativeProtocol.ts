/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscMessage, OscMessageArgument } from './index';

export const ETC_OSC_REFERENCE = 'https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm';
export const ETC_GET_REFERENCE = 'https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm';

export interface NativeQueryPlan {
  address: string;
  family: string;
  kind: 'scalar' | 'resource' | 'enumerate' | 'observe';
  payload: Record<string, unknown>;
  index?: number;
}

const ALIASES: Record<string, string> = {
  magic_sheet: 'ms', submaster: 'sub', snapshot: 'snap', effect: 'fx'
};
export const NATIVE_GET_FAMILIES = ['cue', 'cuelist', 'group', 'macro', 'ms', 'ip', 'fp', 'cp', 'bp', 'preset', 'sub', 'fx', 'curve', 'snap', 'pixmap', 'patch', 'fpe'] as const;

function targetNumber(value: unknown, label: string, fallback?: number): string {
  const text = String(value ?? fallback ?? '');
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) {
    throw new Error(`Identifiant Eos ${label} invalide ou absent.`);
  }
  return text;
}

/** The templates describe native requests; never serialize a tool's JSON arguments onto OSC. */
export function planNativeQuery(template: string, payload: Record<string, unknown> = {}): NativeQueryPlan {
  let address = template;
  const old: Record<string, string> = {
    '/eos/get/show/name': '/eos/get/show/path', '/eos/get/setup_defaults': '/eos/get/setup',
    '/eos/get/live/blind': '/eos/out/event/state', '/eos/get/active/cue': '/eos/out/active/cue',
    '/eos/get/pending/cue': '/eos/out/pending/cue', '/eos/get/active/wheels': '/eos/out/active/wheel',
    '/eos/get/softkey_labels': '/eos/out/softkey',
    '/eos/get/fpe/set/count': '/eos/get/fpe/count', '/eos/get/fpe/set': '/eos/get/fpe/{set}',
    '/eos/get/fpe/point': '/eos/get/fpe/{set}/{point}',
    '/eos/get/patch/chan_info': '/eos/get/patch/{channel}/{part}',
    '/eos/get/patch/chan_pos': '/eos/get/patch/{channel}/{part}/augment3d/position',
    '/eos/get/patch/chan_beam': '/eos/get/patch/{channel}/{part}/augment3d/beam',
    '/eos/get/cuelist/info': '/eos/get/cuelist/{cuelist}'
  };
  address = old[address] ?? address;
  if (address.startsWith('/eos/out/')) return { address, family: address.slice(9), kind: 'observe', payload };
  address = address.replace(/^\/eos\/get\/(magic_sheet|submaster|snapshot|effect)(?=\/|$)/, (_, family: string) => `/eos/get/${ALIASES[family]}`);
  if (address === '/eos/get/version' || address === '/eos/get/setup' || address === '/eos/get/show/path') {
    return { address, family: address.slice(9), kind: 'scalar', payload };
  }
  let family = address.split('/')[3];
  if (family === 'palette' || family === '{palette_type}') {
    family = String(payload.type ?? payload.palette_type);
    if (!['ip', 'fp', 'cp', 'bp'].includes(family)) throw new Error('Type de palette Eos requis.');
    address = `/eos/get/${family}/{number}`;
  }
  if (!NATIVE_GET_FAMILIES.includes(family as typeof NATIVE_GET_FAMILIES[number])) {
    throw new Error(`Aucune lecture OSC ETC implementee pour ${template}.`);
  }
  const values: Record<string, unknown> = {
    ...payload,
    number: payload.number ?? payload[family] ?? payload[`${family}_number`] ?? payload.palette ?? payload.preset ?? payload.submaster ?? payload.snapshot ?? payload.effect ?? payload.ms ?? payload.pixmap,
    channel: payload.channel ?? payload.channel_number,
    part: payload.part ?? payload.part_number ?? (family === 'cue' ? 0 : 1),
    cuelist: payload.cuelist ?? payload.cuelist_number ?? payload.cue_list ?? payload.list ?? 1,
    cue: payload.cue ?? payload.cue_number,
    set: payload.set ?? payload.set_number,
    point: payload.point ?? payload.point_number
  };
  if (address === '/eos/get/cuelist' && ('cuelist' in payload || 'cuelist_number' in payload || 'list' in payload)) {
    address = '/eos/get/cue/{cuelist}/index/{index}'; family = 'cue';
  } else if (address === '/eos/get/cue') {
    address = '/eos/get/cue/{cuelist}/{cue}/{part}';
  } else if (address === `/eos/get/${family}`) {
    address += '/{number}';
  }
  if (family === 'cue' && address === '/eos/get/cue/count') address = '/eos/get/cue/{cuelist}/count';
  if (address.endsWith('/list')) address = address.slice(0, -5) + '/index/{index}';
  if (family === 'cue' && address === '/eos/get/cue/index/{index}') address = '/eos/get/cue/{cuelist}/index/{index}';
  const enumerate = address.endsWith('/index/{index}') && payload.index === undefined;
  address = address.replace(/\{([^}]+)\}/g, (token, key: string) => {
    if (key === 'index' && enumerate) return token;
    return targetNumber(values[key], key);
  });
  return { address, family, kind: enumerate ? 'enumerate' : address.endsWith('/count') ? 'scalar' : 'resource', payload, ...(payload.index !== undefined ? { index: Number(payload.index) } : {}) };
}

export function oscValues(message: OscMessage): unknown[] {
  return (message.args ?? []).map((arg) => arg.type === 'T' ? true : arg.type === 'F' ? false : arg.value);
}

/** ETC list offsets address arguments, not packet numbers; total is the complete list length. */
export class NativeListAssembler {
  private readonly streams = new Map<string, { total: number; values: Map<number, unknown> }>();
  public accept(message: OscMessage): OscMessage | null {
    const match = message.address.match(/^(.*)\/list\/(\d+)\/(\d+)$/);
    if (!match) return message;
    const [, address, startText, totalText] = match;
    const start = Number(startText); const total = Number(totalText); const values = oscValues(message);
    if (total > 100_000 || start + values.length > total) throw new Error('Fragment de liste OSC invalide.');
    let stream = this.streams.get(address);
    if (!stream) { stream = { total, values: new Map() }; this.streams.set(address, stream); }
    if (stream.total !== total) throw new Error('La taille de la liste OSC a change pendant la lecture.');
    values.forEach((value, offset) => {
      const index = start + offset;
      if (stream!.values.has(index) && stream!.values.get(index) !== value) throw new Error('Fragments OSC contradictoires.');
      stream!.values.set(index, value);
    });
    if (stream.values.size !== total) return null;
    const args: OscMessageArgument[] = Array.from({ length: total }, (_, index) => ({ type: 'decoded', value: stream!.values.get(index) }));
    return { ...message, address, args };
  }
}

export function expandOscNumbers(values: unknown[]): number[] {
  const numbers: number[] = [];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) { numbers.push(value); continue; }
    if (typeof value !== 'string') throw new Error('Liste de numeros OSC mal formee.');
    const pieces = value.trim().replace(/\bThru\b/gi, '-').replace(/>/g, '-').replace(/\s*-\s*/g, '-').split(/[,+\s]+/).filter(Boolean);
    for (const piece of pieces) {
      const range = piece.match(/^(\d+)-(\d+)$/);
      if (range) {
        const from = Number(range[1]); const to = Number(range[2]);
        if (to < from || to - from > 100_000 || numbers.length + to - from > 100_000) throw new Error('Plage OSC trop grande ou inversee.');
        for (let n = from; n <= to; n++) numbers.push(n);
      } else if (/^\d+(?:\.\d+)?$/.test(piece)) numbers.push(Number(piece));
      else throw new Error(`Numero OSC invalide: ${piece}.`);
    }
  }
  return numbers;
}

export function requiredSections(family: string): string[] {
  const sections: Record<string, string[]> = {
    group: ['', 'channels'], patch: ['', 'notes'], cue: ['', 'fx', 'links', 'actions'],
    cuelist: ['', 'links'], macro: ['', 'text'], sub: ['', 'fx'], pixmap: ['', 'channels'],
    ip: ['', 'channels', 'byType'], fp: ['', 'channels', 'byType'], cp: ['', 'channels', 'byType'],
    bp: ['', 'channels', 'byType'], preset: ['', 'channels', 'byType', 'fx']
  };
  return sections[family] ?? [''];
}

function field(values: unknown[], index: number, type: 'string' | 'number'): string | number {
  const value = values[index];
  if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) throw new Error(`Argument OSC ${index} absent ou de type incorrect (${type} attendu).`);
  return value as string | number;
}

/** Decode the complete native object, retaining raw sections and only documented properties. */
export function decodeNativeObject(family: string, base: string, sections: Map<string, unknown[]>): Record<string, unknown> {
  const values = sections.get('') ?? [];
  const minimum: Record<string, number> = { cue: 27, cuelist: 13, patch: 20, sub: 13, macro: 4, fx: 8, pixmap: 9, ip: 5, fp: 5, cp: 5, bp: 5, preset: 5 };
  if (values.length < (minimum[family] ?? 3)) throw new Error(`Reponse ${family} incomplete: ${values.length} arguments.`);
  const target = base.replace('/eos/out/get/', '').split('/');
  const number = Number(target[family === 'cue' ? 2 : 1]);
  const record: Record<string, unknown> = {
    number, index: field(values, 0, 'number'), uid: field(values, 1, 'string'), label: field(values, 2, 'string'),
    raw_sections: Object.fromEntries(sections), exists: true
  };
  if (sections.has('channels')) {
    record.channels = expandOscNumbers(sections.get('channels')!.slice(2)); record.members = record.channels;
  }
  if (sections.has('byType')) record.by_type_channels = expandOscNumbers(sections.get('byType')!.slice(2));
  if (sections.has('fx')) record.effects = expandOscNumbers(sections.get('fx')!.slice(2));
  if (sections.has('links')) record.links = sections.get('links')!.slice(2);
  if (sections.has('actions')) record.actions = sections.get('actions')!.slice(2);
  if (sections.has('notes')) record.notes = sections.get('notes')![2] ?? null;
  if (sections.has('text')) record.text = sections.get('text')![2] ?? null;
  const named: Record<string, string[]> = {
    cue: ['up_time_ms','up_delay_ms','down_time_ms','down_delay_ms','focus_time_ms','focus_delay_ms','color_time_ms','color_delay_ms','beam_time_ms','beam_delay_ms','preheat','curve','rate','mark','block','assert','link','follow_time_ms','hang_time_ms','all_fade','loop','solo','timecode','part_count','notes','scene','scene_end','part_index'],
    cuelist: ['playback_mode','fader_mode','independent','htp','assert','block','background','solo','timecode_list','oos_sync'],
    sub: ['mode','fader_mode','htp','exclusive','background','restore','priority','up_time','dwell_time','down_time'],
    macro: ['mode'], fx: ['type','entry','exit','duration','scale'],
    pixmap: ['server_channel','interface','width','height','pixel_count','fixture_count'],
    ip: ['absolute','locked','tracking_channel'], fp: ['absolute','locked','tracking_channel'], cp: ['absolute','locked','tracking_channel'], bp: ['absolute','locked','tracking_channel'], preset: ['absolute','locked','tracking_channel']
  };
  (named[family] ?? []).forEach((key, index) => { if (values[index + 3] !== undefined) record[key] = values[index + 3]; });
  if (family === 'cue') {
    record.cuelist = Number(target[1]); record.cuelist_number = Number(target[1]); record.cue = number;
    record.part = Number(target[3]); record.cue_part = record.part;
    record.timings = Object.fromEntries(['up','down','focus','color','beam'].map((name) => [name, { time: Number(record[`${name}_time_ms`]) / 1000, delay: Number(record[`${name}_delay_ms`]) / 1000 }]));
  }
  if (family === 'patch') {
    const address = Number(field(values, 5, 'number'));
    Object.assign(record, {
      channel_number: number, channel: number, part_number: Number(target[2]),
      manufacturer: field(values, 3, 'string'), model: field(values, 4, 'string'),
      address, dmx_address: address > 0 ? `${Math.floor((address - 1) / 512) + 1}/${((address - 1) % 512) + 1}` : null,
      intensity_address: values[6], level: values[7], gel: values[8],
      text: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`text${i + 1}`, values[9 + i] ?? null])),
      part_count: values[19], ending_address: values[20] ?? null
    });
  }
  return record;
}

export function decodeNativeScalar(plan: NativeQueryPlan, message: OscMessage): unknown {
  const values = oscValues(message);
  if (plan.address.endsWith('/count')) {
    const count = field(values, plan.family === 'fpe' && /\/fpe\/\d+\/count$/.test(plan.address) ? 1 : 0, 'number');
    if (!Number.isInteger(count) || Number(count) < 0) throw new Error('Compte OSC invalide.');
    return { count };
  }
  if (plan.family === 'version') {
    const version = String(field(values, 0, 'string'));
    if (!/\b\d+\.\d+(?:\.\d+)?\b/.test(version) || /^[{[]/.test(version)) throw new Error('Version Eos native invalide.');
    return { version, fixture_library_version: values[1] ?? null, gel_only: values[2] ?? null };
  }
  if (plan.family === 'show/path') { const filePath = String(field(values, 0, 'string')); return { path: filePath, name: filePath.split(/[\\/]/).pop()?.replace(/\.esf\d*d?$/i, '') ?? filePath }; }
  if (plan.family === 'setup') return Object.fromEntries(['up_time','down_time','focus_time','color_time','beam_time'].map((name, index) => [name, Number(field(values, index, 'number'))]));
  if (plan.family === 'fpe') {
    const path = plan.address.split('/').slice(4);
    return path.length === 1
      ? { set_number: Number(path[0]), label: values[1], point_count: values[2], count: values[2] }
      : { set_number: Number(path[0]), point_number: Number(path[1]), label: values[2], focus_palette: values[3], position: { x: values[4], y: values[5], z: values[6] } };
  }
  if (plan.address.endsWith('/augment3d/position')) return { channel_number: Number(plan.address.split('/')[4]), part_number: Number(plan.address.split('/')[5]), position: { x: values[2], y: values[3], z: values[4] }, orientation: { x: values[5], y: values[6], z: values[7] }, fpe_set: values[8] };
  if (plan.address.endsWith('/augment3d/beam')) {
    const count = Number(values[4]);
    if (!Number.isInteger(count) || count < 0 || count > 64 || values.length < 9 + 2 * count) throw new Error('Reponse Augment3d beam incomplete.');
    return { beam_angle: values[2], gel_color: values[3], shutters: Array.from({ length: count }, (_, i) => ({ thrust: values[5 + 2 * i], angle: values[6 + 2 * i] })), gobo: { uuid: values[5 + 2 * count], description: values[6 + 2 * count] }, gobo_rotation: values[7 + 2 * count], hide_beam: values[8 + 2 * count] };
  }
  throw new Error(`Decodeur natif absent pour ${plan.address}.`);
}
