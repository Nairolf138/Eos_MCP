/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { runTool, getStructuredContent } from '../../__tests__/helpers/runTool';
import {
  eosWorkflowCreateLookTool,
  eosWorkflowCreateCueSeriesTool,
  eosWorkflowAutopatchBandTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowRehearsalGoSafeTool,
  eosWorkflowBuildGroupsAndPalettesTool,
  eosWorkflowUpdateCueLookTool
} from '../index';

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  public failAtSendIndex: number | null = null;

  public commandLineText = '';

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
    this.sentMessages.push(message);
    const currentIndex = this.sentMessages.length;

    if (this.failAtSendIndex != null && this.failAtSendIndex === currentIndex) {
      throw new Error(`Echec simule envoi #${currentIndex}`);
    }

    if (message.address === '/eos/get/cmd_line') {
      const reply: OscMessage = {
        address: '/eos/get/cmd_line',
        args: [{ type: 's', value: JSON.stringify({ text: this.commandLineText, user: 0 }) }]
      };
      queueMicrotask(() => {
        for (const listener of this.listeners) {
          listener(reply);
        }
      });
    }
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

describe('workflow tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    setOscClient(new OscClient(service, { defaultTimeoutMs: 100 }));
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('orchestre eos_workflow_create_look et journalise les commandes', async () => {
    const result = await runTool(eosWorkflowCreateLookTool, {
      channels: '1 Thru 3',
      cue_number: 101,
      cuelist_number: 2,
      color_palette: 11,
      focus_palette: 12,
      beam_palette: 13,
      cue_label: 'Look Intro'
    });

    expect(service.sentMessages).toHaveLength(6);
    expect(service.sentMessages.map((msg) => msg.address)).toEqual([
      '/eos/newcmd',
      '/eos/newcmd',
      '/eos/newcmd',
      '/eos/newcmd',
      '/eos/newcmd',
      '/eos/newcmd'
    ]);

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Chan 1 Thru 3',
      'CP 11',
      'FP 12',
      'BP 13',
      'Record Cue 2/101',
      'Cue 2/101 Label "Look Intro"'
    ]);
  });

  it('retourne un echec partiel sur erreur intermediaire de workflow create_look', async () => {
    service.failAtSendIndex = 2;

    const result = await runTool(eosWorkflowCreateLookTool, {
      channels: '5',
      cue_number: 2,
      color_palette: 101
    });

    expect(service.sentMessages).toHaveLength(2);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('partial_failure');
    expect(structured?.partialErrors).toEqual([{ step: 'apply_color_palette', error: 'Echec simule envoi #2' }]);
  });

  it('orchestre eos_workflow_create_cue_series avec increment automatique des cues', async () => {
    const result = await runTool(eosWorkflowCreateCueSeriesTool, {
      base_cuelist_number: 2,
      start_cue_number: 10,
      looks: [
        { channels: '1 Thru 3', color_palette: 11, cue_label: 'Intro' },
        { channels: '4 Thru 6', focus_palette: 20, beam_palette: 30, cue_label: 'Verse' }
      ]
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Chan 1 Thru 3',
      'CP 11',
      'Record Cue 2/10',
      'Cue 2/10 Label "Intro"',
      'Chan 4 Thru 6',
      'FP 20',
      'BP 30',
      'Record Cue 2/11',
      'Cue 2/11 Label "Verse"'
    ]);
  });

  it('genere commands_preview en dry run pour create_cue_series et fallback master cuelist', async () => {
    const result = await runTool(eosWorkflowCreateCueSeriesTool, {
      looks: [
        { channels: '7', cue_label: 'Solo' },
        { channels: '8', color_palette: 12 }
      ],
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commands_preview).toEqual([
      'Chan 7',
      'Record Cue 1',
      'Cue 1 Label "Solo"',
      'Chan 8',
      'CP 12',
      'Record Cue 2'
    ]);
  });

  it('orchestre eos_workflow_patch_fixture avec position 3D par defaut', async () => {
    const result = await runTool(eosWorkflowPatchFixtureTool, {
      channel_number: 201,
      dmx_address: '2/101',
      device_type: 'LED Wash',
      label: 'Contre'
    });

    expect(service.sentMessages).toHaveLength(3);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Patch Chan 201 Part 1 Address 2/101 Type "LED Wash"',
      'Chan 201 Part 1 Label "Contre"',
      'Chan 201 Part 1 Position X 0 Y 0 Z 0'
    ]);
  });

  it('bloque rehearsal_go_safe si la ligne de commande est non vide', async () => {
    service.commandLineText = 'Chan 1 At Full';

    const result = await runTool(eosWorkflowRehearsalGoSafeTool, {
      cuelist_number: 1
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('failed');
    expect(structured?.commandsSent).toEqual([]);
  });


  it('refuse rollback_cuelist_number sans rollback_cue_number', async () => {
    await expect(
      runTool(eosWorkflowRehearsalGoSafeTool, {
        cuelist_number: 1,
        rollback_on_failure: true,
        rollback_cuelist_number: 2
      })
    ).rejects.toThrow('rollback_cue_number est obligatoire si rollback_cuelist_number est fourni');
  });

  it('applique rollback optionnel lors dun echec du go', async () => {
    service.failAtSendIndex = 2;

    const result = await runTool(eosWorkflowRehearsalGoSafeTool, {
      cuelist_number: 1,
      cue_number: 15,
      rollback_on_failure: true,
      rollback_cue_number: 10
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('partial_failure');
    expect(structured?.commandsSent).toEqual(['Go To Cue 1/15', 'Go To Cue 10']);
  });

  it('genere commands_preview en dry run pour autopatch band', async () => {
    const result = await runTool(eosWorkflowAutopatchBandTool, {
      fixtures: [
        {
          count: 2,
          fixture_query: 'Spica',
          universe: 2,
          start_address: 101,
          label_prefix: 'Wash'
        }
      ],
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(Array.isArray(structured?.commands_preview)).toBe(true);
    expect(structured?.fixture_logs).toHaveLength(2);
    expect(structured?.status).toBe('partial_failure');
  });

  it('orchestre eos_workflow_build_groups_and_palettes avec blocs partiels', async () => {
    const result = await runTool(eosWorkflowBuildGroupsAndPalettesTool, {
      groups: [{ number: 1, label: 'Face', channels: '1 Thru 4' }],
      focus_palettes: [{ number: 2, label: 'Down', channels: '1 Thru 4', description: 'Pan 50 Tilt 30' }]
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Chan 1 Thru 4 Record Group 1',
      'Group 1 Label "Face"',
      'Chan 1 Thru 4',
      'Pan 50 Tilt 30',
      'Record FP 2',
      'FP 2 Label "Down"'
    ]);
  });

  it('genere commands_preview en dry run pour build_groups_and_palettes', async () => {
    const result = await runTool(eosWorkflowBuildGroupsAndPalettesTool, {
      color_palettes: [{ number: 10, label: 'Warm', channels: '5', hue: 'Amber', saturation: 45 }],
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.commands_preview).toEqual([
      'Chan 5',
      'Hue Amber',
      'Saturation 45',
      'Record CP 10',
      'CP 10 Label "Warm"'
    ]);
  });

  it('orchestre eos_workflow_update_cue_look avec go-to + update', async () => {
    const result = await runTool(eosWorkflowUpdateCueLookTool, {
      cuelist_number: 4,
      cue_number: 12,
      channels: '1 Thru 5',
      intensity_factor: 0.8
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Go To Cue 4/12',
      'Chan 1 Thru 5',
      'At * 0.8',
      'Update Cue 4/12'
    ]);
  });

  it('genere commands_preview en dry run pour update_cue_look', async () => {
    const result = await runTool(eosWorkflowUpdateCueLookTool, {
      channels: '9',
      desaturate: true,
      warmify: true,
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.commands_preview).toEqual([
      'Chan 9',
      'Update Cue'
    ]);
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: 'apply_desaturate', status: 'skipped' }),
      expect.objectContaining({ step: 'apply_warmify', status: 'skipped' })
    ]));
  });
});
