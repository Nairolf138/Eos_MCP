/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { OscMessage } from '../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../services/osc/client';
import { getOscAddressOfficiality } from '../../services/osc/officiality';
import toolDefinitions from '../index';
import type { ToolDefinition } from '../types';

class Peer implements OscGateway {
  public calls: OscMessage[] = [];
  public async send(message: OscMessage) { this.calls.push(message); }
  public onMessage() { return () => {}; }
}
const SAMPLE_VALUES: Record<string, unknown> = {
  number: 1,
  address_number: '1/001',
  addresses: 1,
  back: false,
  bank_index: 1,
  blue: 0.25,
  button_count: 10,
  button_index: 2,
  channel_number: 1,
  channels: '1 Thru 2',
  clearLine: true,
  color: 'red',
  command: 'Go To Cue 1',
  cuelist_number: 1,
  cue_number: 2,
  cue_part: 1,
  curve_number: 1,
  delta: 1,
  device_type: 'Dimmer',
  dmx_address: '1/001',
  dmx_value: 128,
  effect_number: 1,
  exclusive: false,
  fader_count: 10,
  fader_index: 1,
  fields: ['label'],
  flexi_mode: false,
  format_string: 'Cue %1 -> %2',
  green: 0.5,
  group_number: 1,
  hue: 120,
  key_name: 'go',
  label: 'Contract label',
  level: 50,
  macro_number: 1,
  mode: 'coarse',
  ms_number: 1,
  num_pending_cues: 2,
  num_prev_cues: 2,
  offset: 0,
  osc_command: 'Magic Sheet 1',
  page_number: 1,
  palette_number: 1,
  palette_type: 'ip',
  parameter: 'pan',
  parameter_name: 'pan',
  part: 1,
  part_number: 1,
  pixmap_number: 1,
  point_number: 1,
  preset_number: 1,
  rate: 0.5,
  red: 1,
  require_confirmation: true,
  safety_level: 'off',
  saturation: 75,
  set_number: 1,
  snap: false,
  snapshot_number: 1,
  softkey_number: 1,
  state: true,
  submaster_number: 1,
  substitutions: [1, 50],
  target_type: 'cue',
  target_type_direct_select: 'chan',
  targetAddress: '192.0.2.10',
  targetPort: 3032,
  template: 'Chan %1 At %2',
  terminateWithEnter: true,
  ticks: 3,
  timeoutMs: 50,
  user: 7,
  user_id: 7,
  value: 45,
  values: [1, 50],
  verification_timeout_ms: 50,
  view_number: 1,
  x: 0.1,
  y: 0.2,
  z: 0.3
};

const FIELD_ALIASES: Record<string, string> = {
  target_type: 'target_type',
  target_type_direct_select: 'target_type'
};


function sampleArgsFor(tool: ToolDefinition): Record<string, unknown> {
  const rawShape = tool.config.inputSchema ?? {};
  const args: Record<string, unknown> = {};

  for (const key of Object.keys(rawShape)) {
    if (key === 'target_type' && tool.name.startsWith('eos_direct_select')) {
      args[key] = 'chan';
      continue;
    }
    if (key in SAMPLE_VALUES) {
      args[key] = SAMPLE_VALUES[key];
      continue;
    }
    const alias = FIELD_ALIASES[key];
    if (alias && alias in SAMPLE_VALUES) {
      args[key] = SAMPLE_VALUES[alias];
    }
  }

  if (tool.name === 'eos_cue_fire') {
    delete args.cue_part;
  }
  if (tool.name === 'eos_cue_go') {
    delete args.cue_number;
    delete args.cue_part;
  }
  if (tool.name === 'eos_cue_select') {
    delete args.cuelist_number;
    delete args.cue_part;
  }

  return args;
}


// Literal addresses and typed arguments are based on ETC's OSC Dictionary.
const wireCases: Array<[string, Record<string, unknown>, string, unknown[]]> = [
 ['eos_group_set_level',{group_number:7,level:50},'/eos/group/7',[50]],
 ['eos_address_select',{address_number:'2/41'},'/eos/addr',[553]],
 ['eos_address_set_level',{address_number:'2/41',level:37.5},'/eos/addr/553',[37.5]],
 ['eos_address_set_dmx',{address_number:'2/41',dmx_value:255},'/eos/addr/553/DMX',[255]],
 ['eos_channel_set_parameter',{channels:[101],parameter:'Pan',value:-90},'/eos/chan/101/param/Pan',[-90]],
 ['eos_wheel_tick',{parameter_name:'Pan',mode:'fine',ticks:-2.5},'/eos/wheel/fine/Pan',[-2.5]],
 ['eos_switch_continuous',{parameter_name:'Tilt',rate:-3},'/eos/switch/Tilt',[-3]],
 ['eos_set_color_hs',{hue:330,saturation:75},'/eos/color/hs',[330,75]],
 ['eos_set_color_rgb',{red:1,green:0.25,blue:0.5},'/eos/color/rgb',[1,0.25,0.5]],
 ['eos_set_pantilt_xy',{x:0.2,y:0.8},'/eos/pantilt/xy',[0.2,0.8]],
 ['eos_set_xyz_position',{x:-3,y:4,z:2},'/eos/xyz',[-3,4,2]],
 ['eos_cue_go',{cuelist_number:2},'/eos/cues/2/fire',[]],
 ['eos_cue_go',{cuelist_number:2,cue_number:12.5},'/eos/cue/2/12.5/fire',[]],
 ['eos_cue_fire',{cuelist_number:2,cue_number:12.5,cue_part:1,require_confirmation:true},'/eos/cue/2/12.5/1/fire',[]],
 ['eos_cue_select',{cue_number:12.5},'/eos/cue',[12.5]],
 ['eos_cue_select',{cue_number:12.5,cuelist_number:2},'/eos/cue/2',[12.5]],
 ['eos_cue_select',{cue_number:12.5,cuelist_number:2,cue_part:1},'/eos/cue/2/12.5',[1]],
 ['eos_cue_stop_back',{cuelist_number:2},'/eos/cues/2/stop',[]],
 ['eos_effect_select',{effect_number:7},'/eos/fx',[7]],
 ['eos_effect_stop',{effect_number:7},'/eos/newcmd',['Effect 7 At#']],
 ['eos_effect_stop',{},'/eos/newcmd',['Stop_Effect#']],
 ['eos_snapshot_recall',{snapshot_number:7},'/eos/snap/fire',[7]],
 ['eos_pixmap_select',{pixmap_number:7},'/eos/pixmap',[7]],
 ['eos_curve_select',{curve_number:7},'/eos/curve',[7]],
 ['eos_submaster_set_level',{submaster_number:7,level:37.5},'/eos/sub/7',[0.375]],
 ['eos_submaster_bump',{submaster_number:7,state:true},'/eos/sub/7/fire',[1]],
 ['eos_cue_label_set',{cuelist_number:2,cue_number:12.5,label:'Face # Enter'},'/eos/set/cue/2/12.5/label',['Face # Enter']],
 ['eos_palette_label_set',{palette_type:'cp',palette_number:7,label:'Rouge # Enter'},'/eos/set/cp/7/label',['Rouge # Enter']]
];
const oscTools = toolDefinitions.filter((tool) => Boolean((tool.config.annotations?.mapping as {osc?:unknown})?.osc));

describe('OSC tool contracts exported from src/tools/index.ts', () => {
 let peer: Peer;
 beforeEach(() => { peer = new Peer(); setOscClient(new OscClient(peer,{defaultTimeoutMs:30})); });
 afterEach(() => setOscClient(null));
  it('lists every tool exported from src/tools/index.ts with a stable fixture', () => {
    expect(toolDefinitions.map((tool) => tool.name)).toMatchSnapshot();
  });

  it('lists every exported OSC tool with a stable contract fixture', () => {
    expect(oscTools.map((tool) => tool.name)).toMatchSnapshot();
  });

  it('documents every exported tool in the OSC coverage table', () => {
    const coverage = readFileSync(resolve(__dirname, '../../../docs/osc-coverage.md'), 'utf8');

    for (const tool of toolDefinitions) {
      expect(coverage).toContain(`\`${tool.name}\``);
    }
  });


  it('defines strict OSC routing policy metadata for every tool', () => {
    for (const tool of toolDefinitions) {
      expect(typeof tool.metadata?.nativeOscPreferred).toBe('boolean');
      expect(typeof tool.metadata?.cmdFallbackAllowed).toBe('boolean');
      expect(typeof tool.metadata?.requiresConfirmation).toBe('boolean');
      expect(tool.metadata?.strictModeBehavior).toMatch(/^(native_official_required|validated_cmd_fallback|blocked_without_validated_cmd_fallback|no_osc_transport)$/);
      expect(tool.config.annotations).toMatchObject({
        nativeOscPreferred: tool.metadata?.nativeOscPreferred,
        cmdFallbackAllowed: tool.metadata?.cmdFallbackAllowed,
        requiresConfirmation: tool.metadata?.requiresConfirmation,
        strictModeBehavior: tool.metadata?.strictModeBehavior
      });
    }
  });

  it('does not mark unofficial OSC aliases as native strict-mode targets', () => {
    for (const tool of oscTools) {
      const policy = tool.config.annotations?.oscStrictModePolicy as {
        nativeOscPreferred: boolean;
        cmdFallbackAllowed: boolean;
        strictModeBehavior: string;
        officialOscAddresses: string[];
        blockedOscAddresses: string[];
      };
      expect(policy).toBeDefined();
      for (const address of policy.officialOscAddresses) {
        expect(getOscAddressOfficiality(address)?.strictModeAllowed).toBe(true);
      }
      for (const address of policy.blockedOscAddresses) {
        expect(getOscAddressOfficiality(address)?.strictModeAllowed).not.toBe(true);
      }
      if (policy.blockedOscAddresses.length > 0) {
        expect(policy.strictModeBehavior).toBe('blocked_without_validated_cmd_fallback');
        expect(policy.nativeOscPreferred).toBe(false);
        expect(policy.cmdFallbackAllowed).toBe(false);
      }
    }
  });


 test.each(oscTools.map((tool) => [tool.name,tool] as const))('%s rejects unknown arguments before any OSC', async (_name,tool) => {
   const args = sampleArgsFor(tool);
   z.object(tool.config.inputSchema ?? {}).strict().parse(args);
   await expect(tool.handler({...args,unexpected_parameter:true}, {})).rejects.toThrow();
   expect(peer.calls).toEqual([]);
 });
 test.each(wireCases)('%s uses documented typed OSC (%j)', async (name,args,address,values) => {
   const tool = toolDefinitions.find((entry) => entry.name === name)!;
   await tool.handler(args,{});
   expect(peer.calls).toHaveLength(1);
   expect(peer.calls[0].address).toBe(address);
   expect((peer.calls[0].args ?? []).map((arg) => arg.value)).toEqual(values);
   const types = (peer.calls[0].args ?? []).map((arg) => arg.type);
   if (name === 'eos_address_select' || name === 'eos_address_set_dmx') expect(types).toEqual(['i']);
   if (name.startsWith('eos_set_') || name === 'eos_channel_set_parameter') expect(types.every((type) => type === 'f')).toBe(true);
 });
});
