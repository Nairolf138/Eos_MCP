import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosPatchGetAugment3dBeamTool,
  eosPatchGetAugment3dPositionTool,
  eosPatchGetChannelInfoTool
} from '../index';

interface ToolHandler {
  (args: unknown, extra?: unknown): Promise<any>;
}

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public async send(message: OscMessage): Promise<void> {
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

function extractObjectContent(result: any): any {
  const content = (result?.content ?? []) as any[];
  return content.find((item) => item.type === 'object')?.data ?? null;
}

describe('patch tools', () => {
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

  it("envoie l'ordre de lecture des informations de patch", async () => {
    const promise = runTool(eosPatchGetChannelInfoTool, { channel_number: 101, part_number: 0 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.patch.channelInfo);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ channel: 101, part: 0 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.patch.channelInfo,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', channel: { channel: 101, parts: [] } })
          }
        ]
      });
    });

    await promise;
  });

  it('normalise les informations recues pour un canal multi-parties', async () => {
    const promise = runTool(eosPatchGetChannelInfoTool, { channel_number: 205, part_number: 0 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        channel: {
          channel: '205',
          label: 'Lead Special',
          part_count: '2',
          notes: 'Main wash',
          manufacturer: 'ETC',
          model: 'Source Four LED',
          address: '2/041',
          texts: ['Front', 'Warm'],
          parts: [
            {
              part: '1',
              label: 'Main',
              text_1: 'Front',
              text_2: 'Warm',
              notes: 'Focus DS',
              gel: 'R132'
            },
            {
              part_number: 2,
              label: 'Spare',
              manufacturer: 'ETC',
              model: 'Source Four LED',
              address: { universe: 2, address: 61 },
              text: ['Spare blade'],
              notes: ''
            }
          ]
        }
      };

      service.emit({
        address: oscMappings.patch.channelInfo,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = extractObjectContent(result);

    expect(objectContent).toMatchObject({
      status: 'ok',
      channel: {
        channel_number: 205,
        label: 'Lead Special',
        part_count: 2,
        notes: 'Main wash',
        parts: [
          {
            part_number: 1,
            label: 'Main',
            manufacturer: 'ETC',
            model: 'Source Four LED',
            dmx_address: '2/041',
            gel: 'R132',
            text: {
              text1: 'Front',
              text2: 'Warm'
            },
            notes: 'Focus DS'
          },
          {
            part_number: 2,
            label: 'Spare',
            manufacturer: 'ETC',
            model: 'Source Four LED',
            dmx_address: '2/061',
            gel: null,
            text: {
              text1: 'Spare blade'
            },
            notes: null
          }
        ]
      }
    });
  });

  it('normalise la position Augment3d', async () => {
    const promise = runTool(eosPatchGetAugment3dPositionTool, { channel_number: 12, part_number: 1 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        augment3d: {
          channel: '12',
          part: '1',
          position: { x: '1.5', y: '-2.25', z: 4 },
          orientation: ['90', '0', '-45.5'],
          fpe_set: '3'
        }
      };

      service.emit({
        address: oscMappings.patch.augment3dPosition,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = extractObjectContent(result);

    expect(objectContent).toMatchObject({
      status: 'ok',
      augment3d: {
        channel_number: 12,
        part_number: 1,
        position: { x: 1.5, y: -2.25, z: 4 },
        orientation: { x: 90, y: 0, z: -45.5 },
        fpe_set: 3
      }
    });
  });

  it('normalise les informations de faisceau Augment3d', async () => {
    const promise = runTool(eosPatchGetAugment3dBeamTool, { channel_number: 12, part_number: 1 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        augment3d: {
          channel_number: 12,
          part_number: 1,
          beam_angle: '18.5',
          gel: 'L201',
          shutters: {
            top: '12',
            bottom: { angle: '-8.5' },
            left: 0,
            right: null
          },
          gobo: 'Breakup',
          gobo_rotation: '-45',
          hide_beam: 'false'
        }
      };

      service.emit({
        address: oscMappings.patch.augment3dBeam,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = extractObjectContent(result);

    expect(objectContent).toMatchObject({
      status: 'ok',
      augment3d: {
        channel_number: 12,
        part_number: 1,
        beam_angle: 18.5,
        gel_color: 'L201',
        shutters: {
          top: 12,
          bottom: -8.5,
          left: 0,
          right: null
        },
        gobo: 'Breakup',
        gobo_rotation: -45,
        hide_beam: false
      }
    });
  });

  it('valide les numeros de canal et de partie', async () => {
    await expect(runTool(eosPatchGetChannelInfoTool, { channel_number: 0, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dPositionTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dBeamTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
  });
});
