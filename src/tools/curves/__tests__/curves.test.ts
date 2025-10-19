import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import { eosCurveGetInfoTool, eosCurveSelectTool } from '../index';

type ToolHandler = (args: unknown, extra?: unknown) => Promise<any>;

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

describe('curve tools', () => {
  let service: FakeOscService;

  const runTool = async (tool: any, args: unknown): Promise<any> => {
    const handler = tool.handler as ToolHandler;
    return handler(args, {});
  };

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie la selection de courbe avec le numero attendu", async () => {
    await runTool(eosCurveSelectTool, { curve_number: 4 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.curves.select });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ curve: 4 });
  });

  it('normalise les informations renvoyees pour une courbe custom', async () => {
    const promise = runTool(eosCurveGetInfoTool, {
      curve_number: 8,
      fields: ['label', 'points', 'type']
    });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        curve: {
          curve_number: '8',
          name: 'Custom Fade',
          type: 'Time',
          data: [
            [0, 0],
            { in: 50, out: '65.5' },
            { x: '100', y: 100 }
          ]
        }
      };

      service.emit({
        address: oscMappings.curves.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = (result.content as any[]).find((item) => item.type === 'text');
    expect(textContent.text).toBe('Courbe 8 "Custom Fade" (Time) - 3 points.');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      status: 'ok',
      error: null,
      curve: {
        curve_number: 8,
        label: 'Custom Fade',
        kind: 'Time',
        points: [
          { input: 0, output: 0 },
          { input: 50, output: 65.5 },
          { input: 100, output: 100 }
        ]
      }
    });

    const request = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(request.fields).toEqual(['label', 'points', 'type']);
  });

  it('signale une erreur lorsque la courbe est introuvable', async () => {
    const promise = runTool(eosCurveGetInfoTool, { curve_number: 42 });

    queueMicrotask(() => {
      const payload = {
        status: 'error',
        message: 'Curve not found'
      };

      service.emit({
        address: oscMappings.curves.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const textContent = (result.content as any[]).find((item) => item.type === 'text');
    expect(textContent.text).toBe('Courbe 42 introuvable.');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      status: 'error',
      error: 'Curve not found',
      curve: {
        curve_number: 42,
        label: null,
        kind: null,
        points: []
      }
    });
  });
});
