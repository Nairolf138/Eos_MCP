import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosPresetFireTool,
  eosPresetSelectTool,
  eosPresetGetInfoTool
} from '../index';
import { isObjectContent, runTool } from '../../__tests__/helpers/runTool';

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

  public emit(message: OscMessage): void {
    this.listeners.forEach((listener) => listener(message));
  }
}

function assertHasPresetDetails(
  data: Record<string, unknown>
): asserts data is {
  action: string;
  status: string;
  preset: {
    flags: Record<string, boolean>;
    effects: unknown[];
    channels: unknown[];
  };
} {
  const preset = (data as { preset?: unknown }).preset;
  if (typeof preset !== 'object' || preset === null) {
    throw new Error('Expected preset details');
  }

  const presetData = preset as {
    flags?: unknown;
    effects?: unknown;
    channels?: unknown;
  };

  if (
    typeof presetData.flags !== 'object' ||
    presetData.flags === null ||
    !Array.isArray(presetData.effects) ||
    !Array.isArray(presetData.channels)
  ) {
    throw new Error('Preset details missing expected properties');
  }
}

describe('preset tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('envoie le declenchement de preset avec le numero attendu', async () => {
    await runTool(eosPresetFireTool, { preset_number: 7 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.presets.fire });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'i', value: 7 });
  });

  it('envoie la selection de preset avec le numero attendu', async () => {
    await runTool(eosPresetSelectTool, { preset_number: 9 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.presets.select });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'i', value: 9 });
  });

  it('normalise la reponse preset avec effets et flags', async () => {
    const promise = runTool(eosPresetGetInfoTool, { preset_number: 42, fields: ['label'] });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.presets.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              preset: {
                number: '42',
                label: 'Ambient Wash',
                absolute: 1,
                locked: 0,
                channels: [1, { channel: '5' }, { id: 7 }],
                flags: {
                  background: 'yes',
                  block: 1,
                  assert: 0,
                  solo_mode: true,
                  mark: 'on'
                },
                effects: [
                  {
                    effect: 12,
                    label: 'Pulse',
                    rate: '120',
                    channels: [1, 2],
                    flags: {
                      block: 1
                    }
                  },
                  {
                    effect_number: '12',
                    targets: [{ channel: 7 }],
                    flags: {
                      assert: true
                    }
                  },
                  8,
                  {
                    id: 9,
                    name: 'Chase',
                    type: 'linear',
                    speed: 0.5,
                    members: [{ channel: 5 }, 10],
                    flags: {
                      solo: 'on'
                    }
                  }
                ]
              }
            })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = result.content.find(isObjectContent);
    expect(objectContent).toBeDefined();
    if (!objectContent) {
      throw new Error('Expected object content');
    }

    const data = objectContent.data;
    assertHasPresetDetails(data);

    expect(data).toMatchObject({
      action: 'preset_get_info',
      status: 'ok',
      preset: {
        preset_number: 42,
        label: 'Ambient Wash',
        absolute: true,
        locked: false,
        channels: [1, 2, 5, 7, 10]
      }
    });

    expect(data.preset.flags).toEqual({
      absolute: true,
      locked: false,
      assert: false,
      block: true,
      background: true,
      solo: true,
      mark: true,
      inhibit: false
    });

    expect(data.preset.effects).toEqual([
      {
        effect_number: 8,
        label: null,
        type: null,
        rate: null,
        channels: [],
        flags: {
          assert: false,
          block: false,
          background: false,
          solo: false,
          mark: false,
          manual: false,
          independent: false
        }
      },
      {
        effect_number: 9,
        label: 'Chase',
        type: 'linear',
        rate: 0.5,
        channels: [5, 10],
        flags: {
          assert: false,
          block: false,
          background: false,
          solo: true,
          mark: false,
          manual: false,
          independent: false
        }
      },
      {
        effect_number: 12,
        label: 'Pulse',
        type: null,
        rate: 120,
        channels: [1, 2, 7],
        flags: {
          assert: true,
          block: true,
          background: false,
          solo: false,
          mark: false,
          manual: false,
          independent: false
        }
      }
    ]);
  });
});
