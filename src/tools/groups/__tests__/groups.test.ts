import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { getResourceCache } from '../../../services/cache/index';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosGroupSelectTool,
  eosGroupSetLevelTool,
  eosGroupGetInfoTool,
  eosGroupListAllTool
} from '../index';

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

const runTool = async (tool: any, args: unknown): Promise<any> => {
  const handler = tool.handler as unknown as (input: unknown, extra?: unknown) => Promise<any>;
  return handler(args, {});
};

describe('group tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    getResourceCache().clearAll();
  });

  afterEach(() => {
    setOscClient(null);
    getResourceCache().clearAll();
  });

  it('envoie la selection de groupe avec le numero attendu', async () => {
    await runTool(eosGroupSelectTool, { group_number: 5 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.groups.select });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ group: 5 });
  });

  it('convertit le mot-cle full en 100 pour le reglage de niveau', async () => {
    await runTool(eosGroupSetLevelTool, { group_number: 12, level: 'full' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.groups.level });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ group: 12, level: 100 });
  });

  it('normalise la reponse groupe avec plusieurs membres', async () => {
    const promise = runTool(eosGroupGetInfoTool, { group_number: 3 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.groups.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              group: {
                number: 3,
                label: 'Chorus',
                members: [
                  { channel: 1, label: 'Lead' },
                  { channel: 5 },
                  2
                ]
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
      action: 'get_info',
      status: 'ok',
      group: {
        group_number: 3,
        label: 'Chorus',
        members: [
          { channel: 1, label: 'Lead' },
          { channel: 2, label: null },
          { channel: 5, label: null }
        ]
      }
    });
  });

  it('normalise la liste de groupes avec membres multiples', async () => {
    const promise = runTool(eosGroupListAllTool, {});

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.groups.list,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              groups: [
                {
                  number: 1,
                  label: 'Front',
                  members: [1, { channel: 4, label: 'Side' }]
                },
                {
                  number: 2,
                  label: 'Rear',
                  members: []
                }
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
      action: 'list_all',
      status: 'ok',
      groups: [
        {
          group_number: 1,
          label: 'Front',
          members: [
            { channel: 1, label: null },
            { channel: 4, label: 'Side' }
          ]
        },
        {
          group_number: 2,
          label: 'Rear',
          members: []
        }
      ]
    });
  });

  it('utilise le cache pour les requetes get_info consecutives', async () => {
    const firstPromise = runTool(eosGroupGetInfoTool, { group_number: 7 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.groups.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              group: {
                number: 7,
                label: 'Cache Test',
                members: [1]
              }
            })
          }
        ]
      });
    });

    const firstResult = await firstPromise;
    expect(service.sentMessages).toHaveLength(1);

    const secondResult = await runTool(eosGroupGetInfoTool, { group_number: 7 });
    expect(service.sentMessages).toHaveLength(1);
    expect(secondResult).toBe(firstResult);

    const stats = getResourceCache().getStats('groups');
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
  });
});
