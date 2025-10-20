import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosFpeGetSetCountTool,
  eosFpeGetSetInfoTool,
  eosFpeGetPointInfoTool
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

function extractTextContent(result: any): string | null {
  const content = (result?.content ?? []) as any[];
  return content.find((item) => item.type === 'text')?.text ?? null;
}

describe('fpe tools', () => {
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

  it('recupere le nombre de sets FPE', async () => {
    const promise = runTool(eosFpeGetSetCountTool, {});

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.fpe.getSetCount);
    expect(message.args).toEqual([]);

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        count: '5',
        sets: [{ set: 1 }, { set: 2 }, { set: 3 }, { set: 4 }, { set: 5 }]
      };

      service.emit({
        address: oscMappings.fpe.getSetCount,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = extractTextContent(result);
    const objectContent = extractObjectContent(result);

    expect(textContent).toBe('Nombre de sets FPE: 5.');
    expect(objectContent).toMatchObject({
      action: 'get_set_count',
      set_count: 5,
      status: 'ok'
    });
  });

  it("normalise les informations d'un set et de ses points", async () => {
    const promise = runTool(eosFpeGetSetInfoTool, { set_number: 3 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.fpe.getSetInfo);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ set: 3 });

    queueMicrotask(() => {
      const responsePayload = {
        status: 'ok',
        sets: [
          { set: '2', label: 'Rehearsal', point_count: 1, points: [] },
          {
            id: '3',
            name: 'Main Stage',
            total_points: '2',
            points: [
              { point: '1', label: 'Upstage', focus_palette: '101', position: ['1.5', '-2.25', '3.75'] },
              { index: 2, name: 'Downstage', fp: 102, x: 0, y: '1.5', z: '3.25' }
            ]
          }
        ]
      };

      service.emit({
        address: oscMappings.fpe.getSetInfo,
        args: [
          {
            type: 's',
            value: JSON.stringify(responsePayload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = extractTextContent(result);
    const objectContent = extractObjectContent(result);

    expect(textContent).toBe('Set FPE 3 "Main Stage" - 2 points.');
    expect(objectContent).toMatchObject({
      action: 'get_set_info',
      status: 'ok',
      set_number: 3,
      set: {
        set_number: 3,
        label: 'Main Stage',
        point_count: 2,
        points: [
          {
            point_number: 1,
            label: 'Upstage',
            focus_palette_number: 101,
            position: { x: 1.5, y: -2.25, z: 3.75 }
          },
          {
            point_number: 2,
            label: 'Downstage',
            focus_palette_number: 102,
            position: { x: 0, y: 1.5, z: 3.25 }
          }
        ]
      }
    });
  });

  it("normalise les informations d'un point FPE", async () => {
    const promise = runTool(eosFpeGetPointInfoTool, { set_number: 4, point_number: 2 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.fpe.getPointInfo);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ set: 4, point: 2 });

    queueMicrotask(() => {
      const responsePayload = {
        status: 'ok',
        set: {
          set_number: '4',
          label: 'Balcony',
          points: [
            { point_number: 1, label: 'Left', focus_palette: '201', position: { x: '1', y: '2', z: '3' } },
            {
              point_number: '2',
              label: 'Right',
              focusPaletteNumber: '202',
              coordinates: ['4.5', '6.1', null]
            }
          ]
        },
        point: {
          set: '4',
          point: '2',
          name: 'Right Balcony',
          focus: '202',
          location: { horizontal: '4.5', vertical: '6.1', depth: '0.0' }
        }
      };

      service.emit({
        address: oscMappings.fpe.getPointInfo,
        args: [
          {
            type: 's',
            value: JSON.stringify(responsePayload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = extractTextContent(result);
    const objectContent = extractObjectContent(result);

    expect(textContent).toBe(
      'Point FPE 4.2 "Right Balcony" - Palette focus 202 - Position (4.5, 6.1, 0).'
    );
    expect(objectContent).toMatchObject({
      action: 'get_point_info',
      status: 'ok',
      set_number: 4,
      point_number: 2,
      point: {
        set_number: 4,
        point_number: 2,
        label: 'Right Balcony',
        focus_palette_number: 202,
        position: { x: 4.5, y: 6.1, z: 0 }
      }
    });
  });

  it('signale les sets introuvables', async () => {
    const promise = runTool(eosFpeGetSetInfoTool, { set_number: 12 });

    queueMicrotask(() => {
      const responsePayload = {
        status: 'error',
        error: 'Set not found'
      };

      service.emit({
        address: oscMappings.fpe.getSetInfo,
        args: [
          {
            type: 's',
            value: JSON.stringify(responsePayload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = extractTextContent(result);
    const objectContent = extractObjectContent(result);

    expect(textContent).toBe('Set FPE 12 introuvable.');
    expect(objectContent).toMatchObject({
      status: 'error',
      set_number: 12,
      error: 'Set not found'
    });
  });
});
