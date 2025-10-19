import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosChannelSetLevelTool,
  eosSetDmxTool,
  eosChannelGetInfoTool
} from '../index';

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

describe('channel tools', () => {
  let service: FakeOscService;

  const runTool = async (tool: any, args: unknown): Promise<any> => {
    const handler = tool.handler as unknown as (input: unknown, extra?: unknown) => Promise<any>;
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

  it('convertit le mot-cle out en niveau 0 avant envoi', async () => {
    await runTool(eosChannelSetLevelTool, { channels: [1, 2], level: 'out' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.channels.level });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ level: 0, channels: [1, 2] });
  });

  it('transforme full en 255 pour le DMX', async () => {
    await runTool(eosSetDmxTool, { addresses: [101], value: 'full' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.channels.dmx });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ value: 255, addresses: [101] });
  });

  it('parse la reponse JSON pour la commande get_info', async () => {
    const promise = runTool(eosChannelGetInfoTool, { channels: [1], fields: ['label'] });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.channels.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              channels: [
                { id: 1, label: 'Front' }
              ]
            })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    expect(objectContent.data).toMatchObject({
      status: 'ok',
      request: { channels: [1], fields: ['label'] },
      data: {
        status: 'ok',
        channels: [
          { id: 1, label: 'Front' }
        ]
      }
    });
  });
});
