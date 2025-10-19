import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import {
  eosGetSoftkeyLabelsTool,
  eosKeyPressTool,
  eosSoftkeyPressTool
} from '../index';

describe('key tools', () => {
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

  it('envoie un message key press avec la correspondance OSC attendue', async () => {
    await runTool(eosKeyPressTool, { key_name: 'go', state: 1 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/key/go_0',
      args: [{ type: 'f', value: 1 }]
    });
  });

  it('normalise les etats press/release pour les softkeys', async () => {
    await runTool(eosSoftkeyPressTool, { softkey_number: 5 });
    await runTool(eosSoftkeyPressTool, { softkey_number: 5, state: 0 });

    expect(service.sentMessages).toHaveLength(2);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/key/softkey5',
      args: [{ type: 'f', value: 1 }]
    });
    expect(service.sentMessages[1]).toMatchObject({
      address: '/eos/key/softkey5',
      args: [{ type: 'f', value: 0 }]
    });
  });

  it('rejette une softkey hors des bornes 1-12', async () => {
    await expect(runTool(eosSoftkeyPressTool, { softkey_number: 0 })).rejects.toThrow(
      /softkey doit etre compris/
    );
    await expect(runTool(eosSoftkeyPressTool, { softkey_number: 13 })).rejects.toThrow(
      /softkey doit etre compris/
    );
  });

  it('recupere et normalise les libelles de softkeys', async () => {
    const promise = runTool(eosGetSoftkeyLabelsTool, {});

    queueMicrotask(() => {
      service.emit({
        address: '/eos/get/softkey_labels',
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              labels: {
                '1': 'Cue',
                '2': 'Group',
                softkey3: 'Effect'
              }
            })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');

    expect(objectContent).toBeDefined();
    expect(objectContent.data).toMatchObject({
      action: 'get_softkey_labels',
      status: 'ok',
      labels: {
        1: 'Cue',
        2: 'Group',
        3: 'Effect'
      }
    });
  });
});
