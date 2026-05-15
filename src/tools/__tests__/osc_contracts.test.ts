/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { OscMessage, OscMessageArgument } from '../../services/osc/index';
import { setOscClient, type OscClient, type OscJsonResponse, type TargetOptions } from '../../services/osc/client';
import { oscResponseMappings, toEosOutResponseAddress } from '../../services/osc/mappings';
import type { BuiltOscWireMessage } from '../../services/osc/messageBuilders';
import toolDefinitions from '../index';
import type { ToolDefinition } from '../types';
import { runTool } from './helpers/runTool';

interface CapturedOscCall {
  address: string;
  args: OscMessageArgument[];
  options: TargetOptions;
  command?: string;
}

class MockOscClient {
  public readonly calls: CapturedOscCall[] = [];

  public async ping(options: TargetOptions & { message?: string } = {}): Promise<Record<string, unknown>> {
    this.calls.push({
      address: '/eos/ping',
      args: options.message ? [{ type: 's', value: options.message }] : [],
      options
    });
    return { status: 'ok', roundtripMs: 1, echo: options.message ?? null, payload: { status: 'ok' } };
  }

  public async sendCommand(command: string, options: TargetOptions & { user?: number } = {}): Promise<void> {
    this.captureCommand('/eos/cmd', command, options);
  }

  public async sendNewCommand(command: string, options: TargetOptions & { user?: number } = {}): Promise<void> {
    this.captureCommand('/eos/newcmd', command, options);
  }

  public async sendMessage(
    address: string,
    args: OscMessageArgument[] = [],
    options: TargetOptions = {}
  ): Promise<void> {
    this.calls.push({ address, args, options });
  }

  public async requestJson(
    address: string,
    options: TargetOptions & { payload?: Record<string, unknown>; timeoutMs?: number } = {}
  ): Promise<OscJsonResponse> {
    const args = options.payload
      ? [{ type: 's', value: JSON.stringify(options.payload) } satisfies OscMessageArgument]
      : [];
    this.calls.push({ address, args, options });
    return {
      status: 'ok',
      data: this.responseDataFor(address),
      payload: { address, args }
    };
  }

  public async requestBuiltJson(
    request: BuiltOscWireMessage,
    options: TargetOptions & { timeoutMs?: number } = {}
  ): Promise<OscJsonResponse> {
    const message = request.message as OscMessage;
    const args = message.args ?? [];
    this.calls.push({ address: message.address, args, options });
    return {
      status: 'ok',
      data: this.responseDataFor(message.address),
      payload: { address: message.address, args }
    };
  }

  public async getCommandLine(options: TargetOptions & { user?: number } = {}): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    if (typeof options.user === 'number') {
      payload.user = options.user;
    }
    this.calls.push({
      address: '/eos/get/cmd_line',
      args: [{ type: 's', value: JSON.stringify(payload) }],
      options
    });
    return { status: 'ok', text: 'Chan 1', user: options.user ?? null, payload };
  }

  private captureCommand(address: string, command: string, options: TargetOptions & { user?: number }): void {
    const args: OscMessageArgument[] = [{ type: 's', value: command }];
    if (typeof options.user === 'number') {
      args.push({ type: 'i', value: options.user });
    }
    this.calls.push({ address, args, options, command });
  }

  private responseDataFor(address: string): Record<string, unknown> {
    if (address.includes('/live/blind')) {
      return { status: 'ok', state: 'live' };
    }
    if (address.includes('/show/name')) {
      return { status: 'ok', show: 'Contract Test Show' };
    }
    if (address.includes('/softkey_labels')) {
      return { status: 'ok', labels: ['Help', 'More SK'] };
    }
    if (address.includes('/count')) {
      return { status: 'ok', count: 1 };
    }
    if (address.includes('/list')) {
      return { status: 'ok', items: [{ number: 1, label: 'One' }] };
    }
    return {
      status: 'ok',
      number: 1,
      label: 'Contract fixture',
      items: [{ number: 1, label: 'One' }],
      x: 1,
      y: 2,
      z: 3
    };
  }
}

const SAMPLE_VALUES: Record<string, unknown> = {
  address_number: '1/001',
  addresses: '1/001',
  back: false,
  bank_index: 1,
  blue: 64,
  button_count: 10,
  button_index: 2,
  channel_number: 1,
  channels: [1, 2],
  clearLine: true,
  color: 'red',
  command: 'Go To Cue 1',
  cuelist_number: 1,
  cue_number: 2,
  cue_part: 1,
  curve_number: 1,
  delta: 1,
  device_type: 'Source Four LED Series 3 Lustr X8',
  dmx_address: '1/001',
  dmx_value: 128,
  effect_number: 1,
  exclusive: false,
  fader_count: 10,
  fader_index: 1,
  fields: ['label'],
  flexi_mode: false,
  format_string: 'Cue %1 -> %2',
  green: 128,
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
  red: 255,
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


function collectResponseAddressVariants(value: unknown): readonly string[][] {
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return [value];
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectResponseAddressVariants(entry));
  }

  return [];
}

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

  return args;
}

function parseWithStrictSchema(tool: ToolDefinition, args: Record<string, unknown>): void {
  const rawShape = tool.config.inputSchema;
  if (!rawShape) {
    return;
  }
  z.object(rawShape).strict().parse(args);
}

function expectedAddress(tool: ToolDefinition, args: Record<string, unknown>): string {
  if (tool.name === 'eos_palette_get_info') {
    return `/eos/get/${String(args.palette_type)}`;
  }
  if (tool.name === 'eos_cuelist_bank_create') {
    return `/eos/cuelist/${String(args.bank_index)}/config/${String(args.cuelist_number)}/${String(args.num_prev_cues)}/${String(args.num_pending_cues)}/${String(args.offset)}`;
  }
  const mapping = tool.config.annotations?.mapping as { osc?: unknown } | undefined;
  const osc = mapping?.osc;
  if (typeof osc === 'string') {
    return resolveTemplate(osc, args);
  }
  if (osc && typeof osc === 'object') {
    const key = String(args.target_type);
    const address = (osc as Record<string, string>)[key];
    if (address) {
      return address;
    }
  }
  throw new Error(`No OSC mapping for ${tool.name}`);
}

function resolveTemplate(template: string, args: Record<string, unknown>): string {
  return template
    .replace('{bank_index}', String(args.bank_index))
    .replace('{key}', keyIdentifier(args.key_name))
    .replace('softkey{number}', `softkey${String(args.softkey_number)}`)
    .replace('{group}', String(args.group_number))
    .replace('{submaster_number}', String(args.submaster_number))
    .replace('{bank}', String(args.bank_index))
    .replace('{index}', String(args.bank_index))
    .replace('{page}', String(args.page_number ?? 1))
    .replace('{fader}', String(args.fader_index))
    .replace('{faders}', String(args.fader_count))
    .replace('{target}', toolTargetName(args.target_type))
    .replace('{buttons}', String(args.button_count))
    .replace('{button}', String(args.button_index))
    .replace('{flexi}', args.flexi_mode ? '1' : '0')
    .replace('{delta}', String(args.delta))
    .replace('{cuelist_number}', String(args.cuelist_number))
    .replace('{num_prev_cues}', String(args.num_prev_cues))
    .replace('{num_pending_cues}', String(args.num_pending_cues))
    .replace('{offset}', String(args.offset));
}


function keyIdentifier(value: unknown): string {
  const keyMap: Record<string, string> = {
    go: 'go_0',
    stop_back: 'stop/back'
  };
  return keyMap[String(value)] ?? String(value);
}

function toolTargetName(value: unknown): string {
  if (value === 'chan') {
    return 'Chan';
  }
  return String(value);
}

const oscTools = toolDefinitions.filter((tool) => {
  const mapping = tool.config.annotations?.mapping as { osc?: unknown } | undefined;
  return Boolean(mapping?.osc);
});

describe('OSC tool contracts exported from src/tools/index.ts', () => {
  let client: MockOscClient;

  beforeEach(() => {
    client = new MockOscClient();
    setOscClient(client as unknown as OscClient);
  });

  afterEach(() => {
    setOscClient(null);
  });

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


  it('accepts /eos/out/get response variants for every centralised /eos/get endpoint', () => {
    const responseAddressVariants = collectResponseAddressVariants(oscResponseMappings);
    const getEndpointVariants = responseAddressVariants.filter(([requestAddress]) => requestAddress?.startsWith('/eos/get/'));

    expect(getEndpointVariants.length).toBeGreaterThan(0);

    for (const addresses of getEndpointVariants) {
      const [requestAddress] = addresses;
      if (!requestAddress) {
        throw new Error('Missing request address in OSC response mapping');
      }
      expect(addresses).toContain(requestAddress);
      expect(addresses).toContain(toEosOutResponseAddress(requestAddress));
    }
  });

  it.each(oscTools.map((tool) => [tool.name, tool] as const))(
    '%s rejects unknown parameters when its schema is strict',
    async (_name, tool) => {
      const args = sampleArgsFor(tool);
      parseWithStrictSchema(tool, args);
      await expect(runTool(tool, { ...args, unexpected_parameter: true })).rejects.toThrow();
    }
  );

  it.each(oscTools.map((tool) => [tool.name, tool] as const))(
    '%s sends the documented OSC address, payload, and target endpoint',
    async (_name, tool) => {
      const args = sampleArgsFor(tool);
      parseWithStrictSchema(tool, args);

      const extra = tool.name === 'eos_magic_sheet_send_string' ? { role: 'Primary' } : {};
      await runTool(tool, args, extra);

      expect(client.calls).toHaveLength(1);
      const [call] = client.calls;
      expect(call).toMatchObject({
        address: expectedAddress(tool, args),
        options: {
          targetAddress: '192.0.2.10',
          targetPort: 3032
        }
      });
      expect(call?.args ?? []).toMatchSnapshot();
    }
  );

  it('returns stable MCP content when OSC reports an error status', async () => {
    const errorClient = new MockOscClient();
    jest.spyOn(errorClient, 'requestJson').mockResolvedValue({
      status: 'error',
      data: null,
      payload: { status: 'error', error: 'boom' },
      error: 'boom'
    });
    setOscClient(errorClient as unknown as OscClient);

    const tool = toolDefinitions.find((candidate) => candidate.name === 'eos_address_set_dmx');
    if (!tool) {
      throw new Error('eos_address_set_dmx not exported');
    }

    const result = await runTool(tool, {
      address_number: '1/001',
      dmx_value: 64,
      targetAddress: '192.0.2.10',
      targetPort: 3032
    });

    expect(result).toMatchObject({
      content: [{ type: 'text' }],
      structuredContent: {
        action: 'address_set_dmx',
        status: 'error',
        osc: {
          address: '/eos/dmx/address/dmx',
          response: { status: 'error', error: 'boom' }
        }
      }
    });
  });
});
