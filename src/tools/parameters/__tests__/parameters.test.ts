import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosGetActiveWheelsTool,
  eosSetColorHsTool,
  eosSetColorRgbTool,
  eosSetPanTiltXYTool,
  eosSetXYZPositionTool,
  eosWheelSwitchContinuousTool,
  eosWheelTickTool
} from '../index';
import { isObjectContent, runTool } from '../../__tests__/helpers/runTool';

function assertHasWheelData(
  data: Record<string, unknown>
): asserts data is { status: string; wheels: unknown[] } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected wheel data');
  }

  const wheels = (data as { wheels?: unknown }).wheels;
  if (!Array.isArray(wheels)) {
    throw new Error('Expected wheels to be an array');
  }

  const status = (data as { status?: unknown }).status;
  if (typeof status !== 'string') {
    throw new Error('Expected status to be a string');
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

describe('parameter tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('normalise les ticks avant denvoyer une rotation de roue', async () => {
    await runTool(eosWheelTickTool, { parameter_name: 'Pan ', ticks: ' 2,7 ', mode: 'fine' });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.parameters.wheelTick);
    expect(message.args).toHaveLength(1);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ parameter: 'Pan', ticks: 3, mode: 'fine' });
  });

  it('normalise le taux continu et limite la valeur', async () => {
    await runTool(eosWheelSwitchContinuousTool, { parameter_name: 'Tilt', rate: ' 120% ' });

    expect(service.sentMessages).toHaveLength(1);
    const payload = JSON.parse(String(service.sentMessages[0].args?.[0]?.value ?? '{}'));
    expect(payload.rate).toBe(1);
  });

  it('convertit les valeurs HS avec arrondis corrects', async () => {
    await runTool(eosSetColorHsTool, { hue: '180deg', saturation: '62,5%' });

    expect(service.sentMessages).toHaveLength(1);
    const payload = JSON.parse(String(service.sentMessages[0].args?.[0]?.value ?? '{}'));
    expect(payload.hue).toBe(180);
    expect(payload.saturation).toBeCloseTo(62.5, 3);
  });

  it('normalise les composantes RGB et positions XY', async () => {
    await runTool(eosSetColorRgbTool, { red: '80%', green: '0,5', blue: 1.2 });
    await runTool(eosSetPanTiltXYTool, { x: '75%', y: '1.5' });

    expect(service.sentMessages).toHaveLength(2);
    const rgbPayload = JSON.parse(String(service.sentMessages[0].args?.[0]?.value ?? '{}'));
    expect(rgbPayload).toEqual({ red: 0.8, green: 0.5, blue: 1 });

    const xyPayload = JSON.parse(String(service.sentMessages[1].args?.[0]?.value ?? '{}'));
    expect(xyPayload).toEqual({ x: 0.75, y: 1 });
  });

  it('convertit les coordonnees XYZ en conservant les decimales', async () => {
    await runTool(eosSetXYZPositionTool, { x: '2,5m', y: '-1.234', z: '0.7777' });

    expect(service.sentMessages).toHaveLength(1);
    const payload = JSON.parse(String(service.sentMessages[0].args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ x: 2.5, y: -1.234, z: 0.778 });
  });

  it('normalise la reponse des encodeurs actifs', async () => {
    const promise = runTool(eosGetActiveWheelsTool, {});

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        wheels: [
          {
            index: '1',
            parameter: 'Pan',
            label: 'Pan',
            display_value: 'Pan 50%',
            value: '0.5',
            coarse: '50%',
            fine: 0.52,
            unit: '%'
          },
          {
            wheel_index: '2',
            parameter_name: 'Tilt',
            display: 'Tilt 30°',
            raw_value: '30',
            fine_value: '3000%',
            units: 'deg'
          },
          {
            slot: 3,
            name: 'Color',
            percent: '75%'
          }
        ]
      };

      service.emit({
        address: oscMappings.parameters.activeWheels,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
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

    assertHasWheelData(objectContent.data);
    expect(objectContent.data.status).toBe('ok');
    expect(objectContent.data.wheels).toEqual([
      {
        wheelIndex: 1,
        parameter: 'Pan',
        label: 'Pan',
        display: 'Pan 50%',
        units: '%',
        rawValue: 0.5,
        coarseValue: 0.5,
        fineValue: 0.52
      },
      {
        wheelIndex: 2,
        parameter: 'Tilt',
        label: null,
        display: 'Tilt 30°',
        units: 'deg',
        rawValue: 30,
        coarseValue: null,
        fineValue: 30
      },
      {
        wheelIndex: 3,
        parameter: 'Color',
        label: null,
        display: null,
        units: null,
        rawValue: 0.75,
        coarseValue: null,
        fineValue: null
      }
    ]);
  });
});
