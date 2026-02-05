import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import {
  eosCueRecordTool,
  eosCueUpdateTool,
  eosCueLabelSetTool,
  eosPaletteRecordTool,
  eosPaletteLabelSetTool,
  eosPatchSetChannelTool
} from '../index';
import { runTool } from '../../__tests__/helpers/runTool';

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
    this.sentMessages.push(message);
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

describe('programming tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('envoie eos_cue_record via eos_new_command', async () => {
    await runTool(eosCueRecordTool, { cue_number: 1.5, cuelist_number: 2 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [{ type: 's', value: 'Cue 2/1.5 Record#' }]
    });
  });

  it('envoie eos_cue_update et eos_cue_label_set avec labels echappes', async () => {
    await runTool(eosCueUpdateTool, { cue_number: '7' });
    await runTool(eosCueLabelSetTool, { cue_number: '7', label: 'Intro "Blue"' });

    expect(service.sentMessages).toHaveLength(2);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [{ type: 's', value: 'Update Cue 7#' }]
    });
    expect(service.sentMessages[1]).toMatchObject({
      address: '/eos/newcmd',
      args: [{ type: 's', value: 'Cue 7 Label "Intro \\"Blue\\""#' }]
    });
  });

  it('envoie eos_palette_record et eos_palette_label_set avec les prefixes palette', async () => {
    await runTool(eosPaletteRecordTool, { palette_type: 'cp', palette_number: 8 });
    await runTool(eosPaletteLabelSetTool, { palette_type: 'bp', palette_number: 14, label: 'Beam Tight' });

    expect(service.sentMessages).toHaveLength(2);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [{ type: 's', value: 'CP 8 Record#' }]
    });
    expect(service.sentMessages[1]).toMatchObject({
      address: '/eos/newcmd',
      args: [{ type: 's', value: 'BP 14 Label "Beam Tight"#' }]
    });
  });

  it('envoie eos_patch_set_channel avec part par defaut et label optionnel', async () => {
    await runTool(eosPatchSetChannelTool, {
      channel_number: 101,
      dmx_address: '1/120',
      device_type: 'ETC Source Four LED',
      label: 'Face Cour'
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [
        {
          type: 's',
          value: 'Patch Chan 101 Part 1 Address 1/120 Type "ETC Source Four LED" Label "Face Cour"#'
        }
      ]
    });
  });

  it('rejette les proprietes non declarees grace aux schemas stricts', async () => {
    await expect(
      runTool(eosPaletteRecordTool, {
        palette_type: 'ip',
        palette_number: 4,
        extra: true
      })
    ).rejects.toThrow();
  });
});
