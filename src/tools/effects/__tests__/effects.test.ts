import { ZodError } from 'zod';
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosEffectGetInfoTool,
  eosEffectSelectTool,
  eosEffectStopTool
} from '../index';

type ToolHandler = (args: unknown, extra?: unknown) => Promise<any>;

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

describe('effect tools', () => {
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

  it("envoie la selection d'effet avec le numero attendu", async () => {
    await runTool(eosEffectSelectTool, { effect_number: 12 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.select });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ effect: 12 });
  });

  it("envoie l'ordre d'arret avec le numero d'effet si fourni", async () => {
    await runTool(eosEffectStopTool, { effect_number: 7 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.stop });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ effect: 7 });
  });

  it("envoie un arret generique lorsque aucun numero n'est fourni", async () => {
    await runTool(eosEffectStopTool, {});

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.stop });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({});
  });

  it("normalise les informations renvoyees pour un effet dynamique", async () => {
    const promise = runTool(eosEffectGetInfoTool, { effect_number: 907 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        effect: {
          number: '907',
          label: 'Dyn Circle',
          type: 'Relative Dynamic',
          entry: 'Ramp Up',
          exit: 'Stop',
          scale: '150%',
          rate: '120',
          duration: '00:30',
          waveform: 'Sine'
        }
      };

      service.emit({
        address: oscMappings.effects.info,
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
    expect(textContent.text).toBe('Effet 907 "Dyn Circle" (Relative Dynamic, rate 120, scale 150%).');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    expect(objectContent.data).toMatchObject({
      action: 'effect_get_info',
      status: 'ok',
      request: { effect: 907 },
      error: null,
      effect: {
        effect_number: 907,
        label: 'Dyn Circle',
        type: {
          raw: 'Relative Dynamic',
          normalized: 'relative_dynamic',
          category: 'relative_dynamic',
          base: 'relative',
          isDynamic: true
        },
        entry: {
          normalized: 'ramp_up',
          mode: 'fade'
        },
        exit: {
          normalized: 'stop',
          mode: 'stop'
        },
        scale: {
          unit: 'percent',
          percentage: 150,
          ratio: 1.5,
          description: '150%'
        },
        rate: 120,
        duration: 30
      },
      osc: {
        address: oscMappings.effects.info
      }
    });

    expect(objectContent.data.effect.raw).toMatchObject({ waveform: 'Sine' });
  });

  it('signale une erreur lorsque le numero ne correspond a aucun effet', async () => {
    const promise = runTool(eosEffectGetInfoTool, { effect_number: 99 });

    queueMicrotask(() => {
      const payload = {
        status: 'error',
        message: 'Effect not found'
      };

      service.emit({
        address: oscMappings.effects.info,
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
    expect(textContent.text).toBe('Effet 99 introuvable (Effect not found).');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      action: 'effect_get_info',
      status: 'error',
      error: 'Effect not found',
      effect: {
        effect_number: 99
      },
      osc: {
        address: oscMappings.effects.info
      }
    });
  });

  it('valide le numero effet requis', async () => {
    await expect(runTool(eosEffectSelectTool, { effect_number: 0 })).rejects.toThrow(ZodError);
    await expect(runTool(eosEffectGetInfoTool, { effect_number: 0 })).rejects.toThrow(ZodError);
  });
});
