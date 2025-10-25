import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosBeamPaletteFireTool,
  eosColorPaletteFireTool,
  eosFocusPaletteFireTool,
  eosIntensityPaletteFireTool,
  eosPaletteGetInfoTool
} from '../index';
import { isObjectContent, runTool } from '../../__tests__/helpers/runTool';

function assertHasPalette(
  data: Record<string, unknown>
): asserts data is Record<string, unknown> & { palette: Record<string, unknown> } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected palette data');
  }

  const palette = (data as { palette?: unknown }).palette;
  if (typeof palette !== 'object' || palette === null) {
    throw new Error('Palette details missing');
  }
}

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

describe('palette tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('envoie un message json lors du declenchement dune palette', async () => {
    await runTool(eosColorPaletteFireTool, { palette_number: 42 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.palettes.color.fire);
    expect(message.args).toHaveLength(1);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ palette: 42 });
  });

  it('normalise les informations de palette et les canaux par type', async () => {
    const promise = runTool(eosPaletteGetInfoTool, { palette_type: 'fp', palette_number: 12 });

    queueMicrotask(() => {
      const responsePayload = {
        status: 'ok',
        palette: {
          number: '12',
          label: 'Position Scene',
          absolute: 'true',
          locked: 0,
          channels: [12, '5', { channel: 3 }, { number: '7' }],
          'by-type channels': {
            intensity: ['1', '2'],
            focus: [{ channel: 12 }, { channel: '15' }],
            color: ['7'],
            bp: [40, '41'],
            extra: ['50']
          }
        }
      };

      service.emit({
        address: oscMappings.palettes.focus.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(responsePayload)
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

    assertHasPalette(objectContent.data);
    const paletteInfo = objectContent.data.palette as Record<string, unknown> & {
      paletteType: string;
      paletteNumber: number;
      label: string | null;
      absolute: boolean;
      locked: boolean;
      channels: number[];
      byTypeChannels: Record<string, number[]>;
    };
    expect(paletteInfo.paletteType).toBe('fp');
    expect(paletteInfo.paletteNumber).toBe(12);
    expect(paletteInfo.label).toBe('Position Scene');
    expect(paletteInfo.absolute).toBe(true);
    expect(paletteInfo.locked).toBe(false);
    expect(paletteInfo.channels).toEqual([1, 2, 3, 5, 7, 12, 15, 40, 41, 50]);
    expect(paletteInfo.byTypeChannels).toEqual({
      intensity: [1, 2],
      focus: [12, 15],
      color: [7],
      beam: [40, 41],
      extra: [50]
    });
  });

  it('declenche chaque type de palette avec le bon mapping', async () => {
    await runTool(eosIntensityPaletteFireTool, { palette_number: 1 });
    await runTool(eosFocusPaletteFireTool, { palette_number: 2 });
    await runTool(eosBeamPaletteFireTool, { palette_number: 3 });

    expect(service.sentMessages).toHaveLength(3);
    const addresses = service.sentMessages.map((message) => message.address);
    expect(addresses).toEqual([
      oscMappings.palettes.intensity.fire,
      oscMappings.palettes.focus.fire,
      oscMappings.palettes.beam.fire
    ]);
  });
});
