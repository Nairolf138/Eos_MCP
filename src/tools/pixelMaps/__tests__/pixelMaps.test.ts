import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import { eosPixmapGetInfoTool, eosPixmapSelectTool } from '../index';
import largePixmapFixture from './fixtures/pixmap-large.json';

interface ToolHandler {
  (args: unknown, extra?: unknown): Promise<any>;
}

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public send(message: OscMessage): void {
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

describe('pixel map tools', () => {
  let service: FakeOscService;

  const runTool = async (tool: any, args: unknown, extra: unknown = {}): Promise<any> => {
    const handler = tool.handler as ToolHandler;
    return handler(args, extra);
  };

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie l'ordre de selection avec le numero de pixel map", async () => {
    await runTool(eosPixmapSelectTool, { pixmap_number: 12 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.pixelMaps.select);
    expect(message.args).toHaveLength(1);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ pixmap: 12 });
  });

  it('valide la borne inferieure du numero de pixel map', async () => {
    await expect(runTool(eosPixmapSelectTool, { pixmap_number: 0 })).rejects.toThrow();
  });

  it('normalise les informations recues pour un pixel map simple', async () => {
    const promise = runTool(eosPixmapGetInfoTool, { pixmap_number: 7 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        pixmap: {
          pixmap_number: '7',
          label: 'Backdrop',
          width: '64',
          height: '32',
          fixtures: [
            {
              channel: '101',
              label: 'Main Strip',
              segments: [
                { start_pixel: 1, end_pixel: 64, universe: 1, address: 1 },
                { start: 65, count: 64, universe: 1, addr: 129 }
              ]
            }
          ]
        }
      };

      service.emit({
        address: oscMappings.pixelMaps.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[]).find((item) => item.type === 'object');

    expect(objectContent.data).toMatchObject({
      status: 'ok',
      pixmap: {
        pixmap_number: 7,
        label: 'Backdrop',
        width: 64,
        height: 32,
        fixture_count: 1,
        pixel_count: 128,
        fixtures: [
          {
            channel: 101,
            label: 'Main Strip',
            start_pixel: 1,
            end_pixel: 128,
            pixel_count: 128,
            segments: [
              { start_pixel: 1, end_pixel: 64, pixel_count: 64, universe: 1, address: 1 },
              { start_pixel: 65, end_pixel: 128, pixel_count: 64, universe: 1, address: 129 }
            ]
          }
        ]
      }
    });
  });

  it('normalise un grand pixel map avec de multiples fixtures et segments', async () => {
    const promise = runTool(eosPixmapGetInfoTool, { pixmap_number: 205 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.pixelMaps.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(largePixmapFixture)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[]).find((item) => item.type === 'object');

    expect(objectContent.data).toMatchObject({
      status: 'ok',
      pixmap: {
        pixmap_number: 205,
        label: 'Backdrop Main',
        server_channel: 5,
        interface: 'sACN 3',
        width: 192,
        height: 64,
        pixel_count: 12288,
        fixture_count: 4,
        fixtures: [
          {
            channel: 101,
            label: 'Left Wall',
            start_pixel: 1,
            end_pixel: 2048,
            pixel_count: 2048,
            segments: [
              { start_pixel: 1, end_pixel: 1024, pixel_count: 1024, universe: 1, address: 1, string_number: 1 },
              { start_pixel: 1025, end_pixel: 2048, pixel_count: 1024, universe: 1, address: 513, string_number: 2 }
            ]
          },
          {
            channel: 102,
            label: 'Center Wall',
            start_pixel: 2049,
            end_pixel: 4096,
            pixel_count: 2048,
            segments: [
              { start_pixel: 2049, end_pixel: 4096, pixel_count: 2048, universe: 2, address: 1 }
            ]
          },
          {
            channel: 103,
            label: 'Right Wall',
            start_pixel: 4097,
            end_pixel: 8192,
            pixel_count: 4096,
            segments: [
              { start_pixel: 4097, end_pixel: 8192, pixel_count: 4096, universe: 3, address: 1, string_number: 1 }
            ]
          },
          {
            channel: 104,
            label: 'Floor Strip',
            start_pixel: 8193,
            end_pixel: 12288,
            pixel_count: 4096,
            segments: [
              { start_pixel: 8193, end_pixel: 10240, pixel_count: 2048, universe: 4, address: 1 },
              { start_pixel: 10241, end_pixel: 12288, pixel_count: 2048, universe: 4, address: 513, string_number: 4 }
            ]
          }
        ]
      }
    });
  });
});
