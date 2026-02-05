import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { runTool, getStructuredContent } from '../../__tests__/helpers/runTool';
import {
  eosWorkflowCreateLookTool,
  eosWorkflowPatchFixtureTool,
  eosWorkflowRehearsalGoSafeTool
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
      'Cue 2/101 Record',
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
});
