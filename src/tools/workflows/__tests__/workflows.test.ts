/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { runTool, getStructuredContent } from '../../__tests__/helpers/runTool';
import {
  eosWorkflowCreateLookTool,
  eosWorkflowCreateEffectTool,
  eosWorkflowCreateCueSeriesTool,
  eosWorkflowAutopatchBandTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowRehearsalGoSafeTool,
  eosWorkflowBuildGroupsAndPalettesTool,
  eosWorkflowUpdateCueLookTool
} from '../index';
import { eosCueGoTool } from '../../cues/index';

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

  it('genere commands_preview en dry run pour create_look sans envoyer de commande', async () => {
    const result = await runTool(eosWorkflowCreateLookTool, {
      channels: '1 Thru 3',
      cue_number: 101,
      color_palette: 11,
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.commandsSent).toEqual([]);
    expect(structured?.commands_preview).toEqual([
      'Chan 1 Thru 3',
      'CP 11',
      'Record Cue 101'
    ]);
    expect(structured?.command_log).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: 'select_channels', status: 'skipped', command: 'Chan 1 Thru 3' })
    ]));
  });


  it('orchestre eos_workflow_create_effect avec groupe optionnel et parametres', async () => {
    const result = await runTool(eosWorkflowCreateEffectTool, {
      channels: '1 Thru 6',
      effect_number: 21,
      group_number: 3,
      direction: 'right_to_left',
      speed: 1.5,
      size: 75
    });

    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([
      'Chan 1 Thru 6 Record Group 3',
      'Chan 1 Thru 6 Effect 21',
      'Effect 21 Speed 1.5',
      'Effect 21 Size 75',
      'Effect 21 Direction Right To Left',
      'Record Effect 21'
    ]);
    expect(structured?.effect).toEqual({
      effect_number: 21,
      channels: '1 Thru 6',
      group_number: 3,
      parameters: {
        direction: 'right_to_left',
        speed: 1.5,
        size: 75
      }
    });
  });

  it('applique les valeurs par defaut et dry_run pour create_effect', async () => {
    const result = await runTool(eosWorkflowCreateEffectTool, {
      channels: '10',
      effect_number: 22,
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commands_preview).toEqual([
      'Chan 10 Effect 22',
      'Effect 22 Speed 1',
      'Effect 22 Size 100',
      'Effect 22 Direction Left To Right',
      'Record Effect 22'
    ]);
    expect(structured?.effect).toEqual({
      effect_number: 22,
      channels: '10',
      group_number: null,
      parameters: {
        direction: 'left_to_right',
        speed: 1,
        size: 100
      }
    });
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
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: 'default_cuelist_number',
        detail: 'cuelist_number absent: utilisation automatique de la cuelist master.'
      })
    ]));
  });


  it('ignore les champs inconnus sur les workflows sans modifier la logique metier', async () => {
    const result = await runTool(eosWorkflowCreateCueSeriesTool, {
      looks: [
        {
          channels: '7',
          cue_label: 'Solo',
          client_note: 'metadata ignored'
        }
      ],
      dry_run: true,
      client_request_id: 'abc-123'
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commands_preview).toEqual([
      'Chan 7',
      'Record Cue 1',
      'Cue 1 Label "Solo"'
    ]);
    expect(structured).not.toHaveProperty('client_request_id');
  });

  it('conserve strict sur les tools bas niveau sensibles', async () => {
    await expect(
      runTool(eosCueGoTool, {
        cuelist_number: 1,
        dry_run: true,
        client_request_id: 'abc-123'
      })
    ).rejects.toThrow(/Unrecognized key/);
  });

  it('accepte le passthrough et retourne une structure LLM stable sur tous les workflows', async () => {
    const workflowCases = [
      {
        tool: eosWorkflowCreateLookTool,
        args: { channels: '1', cue_number: 1, dry_run: true, client_trace_id: 'trace-create-look' }
      },
      {
        tool: eosWorkflowCreateEffectTool,
        args: { channels: '1', effect_number: 1, dry_run: true, client_trace_id: 'trace-create-effect' }
      },
      {
        tool: eosWorkflowCreateCueSeriesTool,
        args: {
          looks: [{ channels: '1', cue_label: 'A', client_note: 'nested passthrough' }],
          dry_run: true,
          client_trace_id: 'trace-cue-series'
        }
      },
      {
        tool: eosWorkflowPatchFixtureTool,
        args: {
          channel_number: 1,
          dmx_address: '1/1',
          device_type: 'Dimmer',
          label: 'Dimmer 1',
          dry_run: true,
          client_trace_id: 'trace-patch-fixture'
        }
      },
      {
        tool: eosWorkflowAutopatchBandTool,
        args: {
          fixtures: [{ count: 1, fixture_query: 'Spica', universe: 1, start_address: 1, label_prefix: 'Wash', client_note: 'nested passthrough' }],
          dry_run: true,
          client_trace_id: 'trace-autopatch-band'
        }
      },
      {
        tool: eosWorkflowRehearsalGoSafeTool,
        args: { cuelist_number: 1, dry_run: true, client_trace_id: 'trace-rehearsal-go-safe' }
      },
      {
        tool: eosWorkflowBuildGroupsAndPalettesTool,
        args: {
          groups: [{ number: 1, label: 'Face', channels: '1', client_note: 'nested passthrough' }],
          dry_run: true,
          client_trace_id: 'trace-groups-palettes'
        }
      },
      {
        tool: eosWorkflowUpdateCueLookTool,
        args: { channels: '1', dry_run: true, client_trace_id: 'trace-update-cue-look' }
      }
    ];

    for (const workflowCase of workflowCases) {
      const result = await runTool(workflowCase.tool, workflowCase.args);
      const structured = getStructuredContent(result);
      expect(structured?.workflow).toBe(workflowCase.tool.name);
      expect(Array.isArray(structured?.steps)).toBe(true);
      expect(Array.isArray(structured?.commands_preview)).toBe(true);
      expect(Array.isArray(structured?.applied_defaults)).toBe(true);
      expect(Array.isArray(structured?.warnings)).toBe(true);
      expect(structured).not.toHaveProperty('client_trace_id');
    }
  });

  it('expose les defaults documentes dans applied_defaults', async () => {
    const cueSeriesResult = await runTool(eosWorkflowCreateCueSeriesTool, {
      looks: [{ channels: '7', cue_label: 'Solo' }],
      dry_run: true
    });
    const cueSeriesStructured = getStructuredContent(cueSeriesResult);
    expect(cueSeriesStructured?.applied_defaults).toEqual(expect.arrayContaining([
      {
        step: 'default_base_cuelist_number',
        detail: 'base_cuelist_number absent: utilisation automatique de la cuelist master.'
      },
      {
        step: 'default_start_cue_number',
        detail: 'start_cue_number absent: valeur par defaut 1 appliquee automatiquement.'
      },
      {
        step: 'look_1_default_cue_number',
        detail: 'cue_number absent: auto-increment applique avec la valeur 1.'
      }
    ]));

    const updateResult = await runTool(eosWorkflowUpdateCueLookTool, {
      cue_number: 5,
      channels: '9',
      dry_run: true
    });
    const updateStructured = getStructuredContent(updateResult);
    expect(updateStructured?.applied_defaults).toEqual(expect.arrayContaining([
      {
        step: 'default_cuelist_number',
        detail: 'cuelist_number absent: utilisation automatique de la cuelist master pour la cue cible.'
      }
    ]));
  });

  it('garde les noms de workflows homogenes entre code, manifest et docs', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8')) as {
      mcp: { capabilities: { tools: { presentation_order: string[]; featured_workflows: Array<{ id: string }> } } };
    };
    const docs = fs.readFileSync(path.join(repoRoot, 'docs/tools.md'), 'utf8');
    const codeWorkflowNames = [
      eosWorkflowCreateLookTool,
      eosWorkflowCreateEffectTool,
      eosWorkflowCreateCueSeriesTool,
      eosWorkflowPatchFixtureTool,
      eosWorkflowAutopatchBandTool,
      eosWorkflowRehearsalGoSafeTool,
      eosWorkflowBuildGroupsAndPalettesTool,
      eosWorkflowUpdateCueLookTool
    ].map((tool) => tool.name).sort();
    const manifestWorkflowNames = manifest.mcp.capabilities.tools.presentation_order.filter((name) => name.startsWith('eos_workflow_')).sort();

    expect(manifestWorkflowNames).toEqual(codeWorkflowNames);
    for (const workflow of manifest.mcp.capabilities.tools.featured_workflows) {
      expect(codeWorkflowNames).toContain(workflow.id);
      expect(docs).toContain(`\`${workflow.id}\``);
    }
    for (const name of codeWorkflowNames) {
      expect(docs).toContain(`\`${name}\``);
    }
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
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: 'default_base_cuelist_number',
        detail: 'base_cuelist_number absent: utilisation automatique de la cuelist master.'
      }),
      expect.objectContaining({
        step: 'default_start_cue_number',
        detail: 'start_cue_number absent: valeur par defaut 1 appliquee automatiquement.'
      }),
      expect.objectContaining({
        step: 'look_1_default_cue_number',
        detail: 'cue_number absent: auto-increment applique avec la valeur 1.'
      })
    ]));
  });

  it('autorise un cue_number ponctuel dans create_cue_series puis reprend l auto-increment', async () => {
    const result = await runTool(eosWorkflowCreateCueSeriesTool, {
      start_cue_number: 10,
      looks: [
        { channels: '1', cue_number: 20, cue_label: 'Jump' },
        { channels: '2', cue_label: 'Next' }
      ],
      dry_run: true
    });

    const structured = getStructuredContent(result);
    expect(structured?.commands_preview).toEqual([
      'Chan 1',
      'Record Cue 20',
      'Cue 20 Label "Jump"',
      'Chan 2',
      'Record Cue 21',
      'Cue 21 Label "Next"'
    ]);
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: 'look_2_default_cue_number',
        detail: 'cue_number absent: auto-increment applique avec la valeur 21.'
      })
    ]));
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

  it('genere commands_preview en dry run pour patch_fixture', async () => {
    const result = await runTool(eosWorkflowPatchFixtureTool, {
      channel_number: 201,
      dmx_address: '2/101',
      device_type: 'LED Wash',
      label: 'Contre',
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.commandsSent).toEqual([]);
    expect(structured?.commands_preview).toEqual([
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

  it('genere commands_preview en dry run pour rehearsal_go_safe sans precheck OSC', async () => {
    service.commandLineText = 'Chan 1 At Full';

    const result = await runTool(eosWorkflowRehearsalGoSafeTool, {
      cuelist_number: 1,
      cue_number: 15,
      rollback_on_failure: true,
      rollback_cue_number: 10,
      dry_run: true
    });

    expect(service.sentMessages).toHaveLength(0);
    const structured = getStructuredContent(result);
    expect(structured?.status).toBe('ok');
    expect(structured?.commandsSent).toEqual([]);
    expect(structured?.commands_preview).toEqual(['Go To Cue 1/15', 'Go To Cue 10']);
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
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: 'default_cue_number',
        detail: 'cue_number absent: modification appliquee a la cue courante via Update Cue.'
      })
    ]));
  });

  it('applique le fallback cuelist master dans update_cue_look quand seule la cue est fournie', async () => {
    const result = await runTool(eosWorkflowUpdateCueLookTool, {
      cue_number: 5,
      channels: '9',
      dry_run: true
    });

    const structured = getStructuredContent(result);
    expect(structured?.commands_preview).toEqual([
      'Go To Cue 5',
      'Chan 9',
      'Update Cue 5'
    ]);
    expect(structured?.executedSteps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: 'default_cuelist_number',
        detail: 'cuelist_number absent: utilisation automatique de la cuelist master pour la cue cible.'
      })
    ]));
  });
});
