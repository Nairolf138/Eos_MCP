/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { z } from 'zod';
import Ajv from 'ajv';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../server/toolRegistry';
import { OscClient, setOscClient, type OscGateway } from '../../services/osc/client';
import type { OscMessage } from '../../services/osc/index';
import { frame, replyToNativeRequest } from '../../services/osc/__tests__/fixtures/nativePeer';
import { getResourceCache } from '../../services/cache';
import tools from '../index';
import type { ToolDefinition } from '../types';

// These are synthetic ETC wire examples, not an assertion of hardware acceptance.
class Peer implements OscGateway {
  public sent: OscMessage[] = [];
  public listeners = new Set<(message: OscMessage) => void>();
  public respond = replyToNativeRequest;
  public async send(message: OscMessage) { this.sent.push(message); for (const response of this.respond(message)) this.emit(response); }
  public onMessage(listener: (message: OscMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  public emit(message: OscMessage) { for (const listener of this.listeners) listener(message); }
}

const cases: Array<[string, Record<string, unknown>, string, Record<string, unknown>]> = [
  ['eos_group_get_info', { group_number: 7 }, '/eos/get/group/7', { group: { label: 'group 7', members: [{ channel: 101, label: null }, { channel: 102, label: null }] } }],
  ['eos_macro_get_info', { macro_number: 7 }, '/eos/get/macro/7', { macro: { label: 'macro 7' } }],
  ['eos_magic_sheet_get_info', { ms_number: 7 }, '/eos/get/ms/7', { magic_sheet: { label: 'ms 7' } }],
  ['eos_submaster_get_info', { submaster_number: 7 }, '/eos/get/sub/7', { submaster: { label: 'sub 7', priority: 'P3' } }],
  ['eos_effect_get_info', { effect_number: 7 }, '/eos/get/fx/7', { effect: { label: 'fx 7' } }],
  ['eos_curve_get_info', { curve_number: 7 }, '/eos/get/curve/7', { curve: { label: 'curve 7' } }],
  ['eos_snapshot_get_info', { snapshot_number: 7 }, '/eos/get/snap/7', { snapshot: { label: 'snap 7' } }],
  ['eos_pixmap_get_info', { pixmap_number: 7 }, '/eos/get/pixmap/7', { pixmap: { label: 'pixmap 7' } }],
  ['eos_preset_get_info', { preset_number: 7 }, '/eos/get/preset/7', { preset: { label: 'preset 7' } }],
  ...['ip','fp','cp','bp'].map((type): [string, Record<string, unknown>, string, Record<string, unknown>] => ['eos_palette_get_info', { palette_type: type, palette_number: 7 }, `/eos/get/${type}/7`, { palette: { label: `${type} 7` } }]),
  ['eos_cue_get_info', { cue_number: 12.5, cuelist_number: 2 }, '/eos/get/cue/2/12.5/0', { cue: { label: 'cue 12.5' } }],
  ['eos_cuelist_get_info', { cuelist_number: 2 }, '/eos/get/cuelist/2', {}],
  ['eos_patch_get_channel_info', { channel_number: 101, part_number: 1 }, '/eos/get/patch/101/1', { channel: { channel_number: 101, parts: [{ model: 'Dimmer', dmx_address: '2/1' }] } }],
  ['eos_channel_get_info', { channels: [101,102] }, '/eos/get/patch/101/1', {}],
  ['eos_get_version', {}, '/eos/get/version', {}],
  ['eos_get_setup_defaults', {}, '/eos/get/setup', {}],
  ['eos_get_show_name', {}, '/eos/get/show/path', {}],
  ['eos_fpe_get_set_count', {}, '/eos/get/fpe/count', {}],
  ['eos_fpe_get_set_info', { set_number: 1 }, '/eos/get/fpe/1', {}],
  ['eos_fpe_get_point_info', { set_number: 1, point_number: 0 }, '/eos/get/fpe/1/0', {}]
];

describe('Native read tools and their published JSON output schemas', () => {
  let peer: Peer; let client: OscClient;
  const ajv = new Ajv({ strict: false });
  beforeEach(() => { getResourceCache().clearAll(); peer = new Peer(); client = new OscClient(peer, { defaultTimeoutMs: 30 }); setOscClient(client); });
  afterEach(() => setOscClient(null));
  function tool(name: string) { const result = tools.find((entry) => entry.name === name); if (!result) throw new Error(name); return result; }
  function validateSchema(definition: ToolDefinition, data: unknown) {
    let config: ToolDefinition['config'] = {};
    const server = { registerTool: (_name: string, value: ToolDefinition['config']) => { config = value; } } as unknown as McpServer;
    new ToolRegistry(server).register(definition);
    if (config.outputSchema) {
      const validate = ajv.compile(zodToJsonSchema(z.object(config.outputSchema)));
      if (!validate(data)) throw new Error(`${definition.name}: ${JSON.stringify(validate.errors)}`);
    }
  }
  test.each(cases)('%s decodes native OSC, not JSON strings (%j)', async (name, args, address, expected) => {
    const definition = tool(name);
    const result = await definition.handler(args, {});
    expect(peer.sent[0]).toEqual({ address, args: [] });
    expect(result.structuredContent).toMatchObject({ status: 'ok', ...expected });
    validateSchema(definition, result.structuredContent);
  });
  test.each(cases)('%s reports a missing response without fabricated object data (%j)', async (name, args) => {
    peer.respond = () => [];
    const definition = tool(name);
    const result = await definition.handler({ ...args, ...('timeoutMs' in (definition.config.inputSchema ?? {}) ? { timeoutMs: 50 } : {}) }, {});
    expect(result.structuredContent?.status).toBe('timeout');
    validateSchema(definition, result.structuredContent);
  });
  test.each(['cue','cuelist','group','macro','ms','ip','fp','cp','bp','preset','fx','snap','curve','sub','pixmap'])('enumerates %s via count and index with no query arguments', async (family) => {
    const definition = tool('eos_get_list_all');
    const result = await definition.handler({ target_type: family, ...(family === 'cue' ? { cuelist_number: 2 } : {}) }, {});
    expect(result.structuredContent).toMatchObject({ status: 'ok' });
    expect(peer.sent.map((message) => message.address)).toEqual([`/eos/get/${family}${family === 'cue' ? '/2' : ''}/count`, `/eos/get/${family}${family === 'cue' ? '/2' : ''}/index/0`]);
    expect(peer.sent.every((message) => message.args?.length === 0)).toBe(true);
    validateSchema(definition, result.structuredContent);
  });
  test('uses passive live/blind, active and pending cue observations without invented Get requests', async () => {
    peer.emit(frame('/eos/out/event/state', [1]));
    peer.emit(frame('/eos/out/active/cue/2/12.5', [75]));
    peer.emit(frame('/eos/out/pending/cue/2/13/0', []));
    for (const name of ['eos_get_live_blind_state','eos_get_active_cue','eos_get_pending_cue']) {
      const result = await tool(name).handler(name.includes('cue') ? { cuelist_number: 2 } : {}, {});
      expect(result.structuredContent).toMatchObject({ status: 'ok' });
    }
    expect(peer.sent).toEqual([]);
  });
});
