/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscMessage } from '../../index';
/** Synthetic fixtures built from ETC OSC Get argument tables, not captures from a console.
 * https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm
 * Fragment suffixes follow ETCLabs/EosSyncLib's total-argument list convention.
 */
export const typed = (values: unknown[]): NonNullable<OscMessage['args']> => values.map((value) => ({ type: typeof value === 'string' ? 's' : typeof value === 'boolean' ? value ? 'T' : 'F' : Number.isInteger(value) ? 'i' : 'f', value }));
export const frame = (address: string, values: unknown[]): OscMessage => ({ address, args: typed(values) });
export function nativeObject(family: string, number: number, index = -1, label = `${family} ${number}`): OscMessage[] {
  const path = `/eos/out/get/${family}/${family === 'cue' ? `2/${number}/0` : family === 'patch' ? `${number}/1` : number}`;
  const head: unknown[] = [index, `uid-${family}-${number}`, label];
  const properties: Record<string, unknown[]> = {
    patch: ['ETC', 'Dimmer', 513, 513, 50, '', '', '', '', '', '', '', '', '', '', '', 1, 513],
    cue: [2500, 0, 4000, 1000, 3000, 0, 5000, 0, 6000, 0, false, 0, 100, '', false, false, '', -1, -1, false, 0, false, '', 1, '', '', false, 0],
    cuelist: ['Proportional', 'Intensity', false, false, false, false, true, false, 0, false],
    sub: ['Additive', 'Proportional', true, false, true, false, 'P3', '0', 'Man', '0'],
    macro: ['Foreground'], fx: ['Focus', 'Immediate', 'Immediate', 'Infinite', 25],
    pixmap: [100, 'sACN', 16, 8, 128, 2],
    ip: [true, false, 0], fp: [true, false, 0], cp: [true, false, 0], bp: [true, false, 0], preset: [true, false, 0]
  };
  const all = head.concat(properties[family] ?? []);
  const sections: Record<string, unknown[]> = {};
  if (['group','pixmap','ip','fp','cp','bp','preset'].includes(family)) sections.channels = ['101-102'];
  if (['ip','fp','cp','bp','preset'].includes(family)) sections.byType = [];
  if (['cue','sub','preset'].includes(family)) sections.fx = [];
  if (['cue','cuelist'].includes(family)) sections.links = [];
  if (family === 'cue') sections.actions = [];
  if (family === 'patch') sections.notes = [''];
  if (family === 'macro') sections.text = ['Chan 101 At 50#'];
  return [frame(`${path}/list/0/${all.length}`, all), ...Object.entries(sections).map(([section, values]) => {
    const args = head.slice(0, 2).concat(values);
    return frame(`${path}/${section}/list/0/${args.length}`, args);
  })];
}
export function replyToNativeRequest(message: OscMessage): OscMessage[] {
  const address = message.address;
  if (address === '/eos/ping') return [{ ...message, address: '/eos/out/ping' }];
  if (address === '/eos/get/version') return [frame('/eos/out/get/version', ['3.3.6 Build 14', 'Fixture Library 3.3.6', false])];
  if (address === '/eos/get/show/path') return [frame('/eos/out/get/show/path', ['C:/Shows/Rehearsal.esf3d'])];
  if (address === '/eos/get/setup') return [frame('/eos/out/get/setup/list/0/5', [5, 5, 3, 3, 3])];
  if (address === '/eos/get/fpe/1') return [frame('/eos/out/get/fpe/1', [0, 'Stage', 1])];
  if (address === '/eos/get/fpe/1/0') return [frame('/eos/out/get/fpe/1/0', [0, 0, 'Centre', 901, -3, 4, 0])];
  if (address.endsWith('/count')) return [frame(address.replace('/eos/get/', '/eos/out/get/'), address === '/eos/get/fpe/1/count' ? [0, 1] : [1])];
  if (address.endsWith('/augment3d/position')) return [frame(address.replace('/eos/get/', '/eos/out/get/'), [-1, 'uid-patch', 1, 2, 3, 10, 20, 30, 0])];
  if (address.endsWith('/augment3d/beam')) return [frame(address.replace('/eos/get/', '/eos/out/get/'), [-1, 'uid-patch', 25, 'R02', 1, 0.5, 15, 'gobo-1', 'Breakup', 90, false])];
  const match = address.match(/^\/eos\/get\/(\w+)(?:\/(2))?\/(index\/)?(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!match) return [];
  const family = match[1];
  const index = match[3] ? Number(match[4]) : -1;
  const number = match[3] ? 7 : Number(match[4]);
  return nativeObject(family, number, index);
}
