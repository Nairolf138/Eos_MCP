/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import type { OscMessageArgument } from '../../services/osc/index';
import { setOscClient, type OscClient, type TargetOptions } from '../../services/osc/client';
import toolDefinitions from '../index';
import type { ToolDefinition, ToolExecutionResult } from '../types';
import { runTool, getStructuredContent } from './helpers/runTool';

type CapturedCall = {
  address: string;
  args: OscMessageArgument[];
  options: TargetOptions;
};

class PriorityOscClient {
  public readonly calls: CapturedCall[] = [];

  public async sendMessage(address: string, args: OscMessageArgument[] = [], options: TargetOptions = {}): Promise<void> {
    this.calls.push({ address, args, options });
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
    return {
      status: 'ok',
      text: 'Chan 1 At Full',
      user: options.user ?? null,
      payload,
      source: 'mcp_extension_get_cmd_line'
    };
  }
}

function priorityTool(name: string): ToolDefinition {
  const tool = toolDefinitions.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Missing priority tool ${name}`);
  }
  return tool;
}

function parseStrictSchema(tool: ToolDefinition, args: Record<string, unknown>): void {
  if (tool.config.inputSchema) {
    z.object(tool.config.inputSchema).strict().parse(args);
  }
}

function structured(result: ToolExecutionResult): Record<string, unknown> {
  const content = getStructuredContent(result);
  if (!content) {
    throw new Error('Expected structured content');
  }
  return content;
}

const nonCueCases = [
  {
    name: 'eos_channel_set_parameter',
    args: { channels: [2, 1], parameter: 'pan', value: '45', targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [
      { address: '/eos/chan/1/param/pan', args: [{ type: 'f', value: 45 }] },
      { address: '/eos/chan/2/param/pan', args: [{ type: 'f', value: 45 }] }
    ],
    invalidArgs: { channels: [], parameter: 'pan', value: 45 },
    dryRunOscAddress: '/eos/chan/1/param/pan'
  },
  {
    name: 'eos_address_select',
    args: { address_number: '2/41', targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [{ address: '/eos/addr', args: [{ type: 's', value: '2/041' }] }],
    invalidArgs: { address_number: '1 Delete Cue 2' },
    dryRunOscAddress: '/eos/addr'
  },
  {
    name: 'eos_address_set_level',
    args: { address_number: '1/001', level: '37.5%', targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [{ address: '/eos/addr/1%2F001', args: [{ type: 'f', value: 37.5 }] }],
    invalidArgs: { address_number: '1/001', level: 101 },
    dryRunOscAddress: '/eos/addr/1%2F001'
  },
  {
    name: 'eos_address_set_dmx',
    args: { address_number: '1/120', dmx_value: 'full', targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [{ address: '/eos/addr/1%2F120/DMX', args: [{ type: 'i', value: 255 }] }],
    invalidArgs: { address_number: '1/120', dmx_value: 300 },
    dryRunOscAddress: '/eos/addr/1%2F120/DMX'
  },
  {
    name: 'eos_softkey_press',
    args: { softkey_number: 3, state: false, targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [{ address: '/eos/softkey/3', args: [{ type: 'f', value: 0 }] }],
    invalidArgs: { softkey_number: 13 },
    dryRunOscAddress: '/eos/softkey/3'
  },
  {
    name: 'eos_set_user_id',
    args: { user_id: 7, targetAddress: '192.0.2.10', targetPort: 3032 },
    expectedCalls: [{ address: '/eos/user', args: [{ type: 'i', value: 7 }] }],
    invalidArgs: { user_id: -1 },
    dryRunOscAddress: '/eos/user'
  }
] as const;

describe('suite OSC prioritaire', () => {
  let client: PriorityOscClient;

  beforeEach(() => {
    client = new PriorityOscClient();
    setOscClient(client as unknown as OscClient);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it.each(nonCueCases)('$name genere les adresses et arguments OSC attendus', async (testCase) => {
    const tool = priorityTool(testCase.name);
    parseStrictSchema(tool, testCase.args);

    await runTool(tool, testCase.args);

    expect(client.calls).toEqual(testCase.expectedCalls.map((call) => ({
      ...call,
      options: expect.objectContaining({ targetAddress: '192.0.2.10', targetPort: 3032 })
    })));
  });

  it.each(nonCueCases)('$name declare un comportement strict natif et aucun alias de compatibilite non strict', (testCase) => {
    const tool = priorityTool(testCase.name);

    expect(tool.metadata?.strictModeBehavior).toBe('native_official_required');
    expect(tool.metadata?.nativeOscPreferred).toBe(true);
    expect(tool.metadata?.cmdFallbackAllowed).toBe(false);
    expect(tool.config.annotations?.oscStrictModePolicy).toMatchObject({
      blockedOscAddresses: [],
      strictModeBehavior: 'native_official_required'
    });
  });

  it.each(nonCueCases)('$name rejette les entrees invalides et les parametres inconnus', async (testCase) => {
    const tool = priorityTool(testCase.name);

    await expect(runTool(tool, testCase.invalidArgs)).rejects.toThrow();
    await expect(runTool(tool, { ...testCase.args, unexpected_parameter: true })).rejects.toThrow();
    expect(client.calls).toHaveLength(0);
  });

  it.each(nonCueCases)('$name expose un dry_run sans emission OSC', async (testCase) => {
    const tool = priorityTool(testCase.name);

    const result = await runTool(tool, { ...testCase.args, dry_run: true });
    const content = structured(result);

    expect(client.calls).toHaveLength(0);
    expect(content).toMatchObject({ status: 'dry_run', dry_run: true });
    expect(content.osc).toMatchObject({ address: testCase.dryRunOscAddress });
  });

  it('eos_get_command_line lit la ligne de commande avec payload utilisateur et cible OSC', async () => {
    const tool = priorityTool('eos_get_command_line');
    const args = { user: 7, targetAddress: '192.0.2.10', targetPort: 3032, timeoutMs: 50 };
    parseStrictSchema(tool, args);

    const result = await runTool(tool, args);

    expect(client.calls).toEqual([
      {
        address: '/eos/get/cmd_line',
        args: [{ type: 's', value: JSON.stringify({ user: 7 }) }],
        options: expect.objectContaining({ user: 7, targetAddress: '192.0.2.10', targetPort: 3032, timeoutMs: 50 })
      }
    ]);
    expect(structured(result)).toMatchObject({ status: 'ok', text: 'Chan 1 At Full', user: 7 });
  });

  it('eos_get_command_line documente le blocage strict de son endpoint extension et simule le dry_run', async () => {
    const tool = priorityTool('eos_get_command_line');

    expect(tool.metadata?.strictModeBehavior).toBe('blocked_without_validated_cmd_fallback');
    expect(tool.metadata?.nativeOscPreferred).toBe(false);
    expect(tool.config.annotations?.oscStrictModePolicy).toMatchObject({
      blockedOscAddresses: ['/eos/get/cmd_line']
    });

    await expect(runTool(tool, { user: -1 })).rejects.toThrow();

    const result = await runTool(tool, { user: 7, dry_run: true });
    expect(client.calls).toHaveLength(0);
    expect(structured(result)).toMatchObject({
      status: 'dry_run',
      dry_run: true,
      osc: { address: '/eos/get/cmd_line', args: { user: 7 } }
    });
  });

  it('cues fire/go/select utilisent les endpoints natifs en mode strict', async () => {
    await runTool(priorityTool('eos_cue_fire'), { cue_number: 2, confirm: true }, { cueOscMode: 'strict' });
    await runTool(priorityTool('eos_cue_go'), { cuelist_number: 1 }, { cueOscMode: 'strict' });
    await runTool(priorityTool('eos_cue_select'), { cue_number: 2 }, { cueOscMode: 'strict' });

    expect(client.calls).toEqual([
      { address: '/eos/cue/2/fire', args: [], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) },
      { address: '/eos/cue/1/go', args: [], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) },
      { address: '/eos/cue/2', args: [], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) }
    ]);
  });

  it('cues fire/go/select basculent vers /eos/cmd en mode compatibilite', async () => {
    await runTool(priorityTool('eos_cue_fire'), { cuelist_number: 3, cue_number: 2, confirm: true }, { cueOscMode: 'compatibility' });
    await runTool(priorityTool('eos_cue_go'), { cuelist_number: 1 }, { cueOscMode: 'compatibility' });
    await runTool(priorityTool('eos_cue_select'), { cue_number: 2 }, { cueOscMode: 'compatibility' });

    expect(client.calls).toEqual([
      { address: '/eos/cmd', args: [{ type: 's', value: 'Cue 2 CueList 3 Fire' }], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) },
      { address: '/eos/cmd', args: [{ type: 's', value: 'CueList 1 Go' }], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) },
      { address: '/eos/cmd', args: [{ type: 's', value: 'Cue 2' }], options: expect.objectContaining({ wireContract: expect.objectContaining({ family: 'cue' }) }) }
    ]);
  });

  it('cues fire/go/select rejettent les entrees invalides et les parametres inconnus', async () => {
    await expect(runTool(priorityTool('eos_cue_fire'), { cue_number: 0, confirm: true })).rejects.toThrow();
    await expect(runTool(priorityTool('eos_cue_go'), { cuelist_number: 1, cue_part: 1 })).rejects.toThrow();
    await expect(runTool(priorityTool('eos_cue_select'), { cue_number: 1, unexpected_parameter: true })).rejects.toThrow();
    expect(client.calls).toHaveLength(0);
  });

  it('cues fire/go/select exposent le dry_run sans emission OSC', async () => {
    const fire = structured(await runTool(priorityTool('eos_cue_fire'), { cue_number: 2, dry_run: true }));
    const go = structured(await runTool(priorityTool('eos_cue_go'), { cuelist_number: 1, dry_run: true }));
    const select = structured(await runTool(priorityTool('eos_cue_select'), { cue_number: 2, dry_run: true }));

    expect(client.calls).toHaveLength(0);
    expect(fire).toMatchObject({ status: 'dry_run', dry_run: true, osc: { address: '/eos/cue/2/fire', args: [] } });
    expect(go).toMatchObject({ status: 'dry_run', dry_run: true, osc: { address: '/eos/cue/1/go', args: [] } });
    expect(select).toMatchObject({ status: 'dry_run', dry_run: true, osc: { address: '/eos/cue/2', args: [] } });
  });
});
