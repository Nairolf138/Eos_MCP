import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  __resetDirectSelectBankCacheForTests,
  eosDirectSelectBankCreateTool,
  eosDirectSelectPageTool,
  eosDirectSelectPressTool
} from '../index';

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
}

const runTool = async (tool: any, args: unknown): Promise<any> => {
  const handler = tool.handler as unknown as (input: unknown, extra?: unknown) => Promise<any>;
  return handler(args, {});
};

describe('direct select tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    __resetDirectSelectBankCacheForTests();
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('cree un bank avec normalisation du type et conserve la page', async () => {
    await runTool(eosDirectSelectBankCreateTool, {
      bank_index: 2,
      target_type: 'group',
      button_count: 40,
      flexi_mode: true,
      page_number: 3
    });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe(oscMappings.directSelects.bankCreate);

    const payload = JSON.parse(String(message.args?.[0]?.value));
    expect(payload).toEqual({ bank: 2, target: 'Group', buttons: 40, flexi: true, page: 3 });

    service.sentMessages.length = 0;

    await runTool(eosDirectSelectPressTool, { bank_index: 2, button_index: 5, state: 1 });

    expect(service.sentMessages).toHaveLength(1);
    const pressMessage = service.sentMessages[0];
    expect(pressMessage.address).toBe(`${oscMappings.directSelects.base}/2/3/5`);
    expect(pressMessage.args?.[0]).toMatchObject({ type: 'f', value: 1 });
  });

  it('gere la pagination locale et evite les pages negatives', async () => {
    await runTool(eosDirectSelectBankCreateTool, {
      bank_index: 4,
      target_type: 'Chan',
      button_count: 20,
      flexi_mode: false,
      page_number: 1
    });

    service.sentMessages.length = 0;

    const nextPageResult = await runTool(eosDirectSelectPageTool, { bank_index: 4, delta: 2 });
    expect(service.sentMessages).toHaveLength(1);
    const forwardMessage = service.sentMessages[0];
    expect(forwardMessage.address).toBe(oscMappings.directSelects.bankPage);
    const forwardPayload = JSON.parse(String(forwardMessage.args?.[0]?.value));
    expect(forwardPayload).toEqual({ bank: 4, delta: 2 });

    const forwardData = (nextPageResult.content as any[]).find((item) => item.type === 'object');
    expect(forwardData.data).toMatchObject({ previousPage: 1, page: 3 });

    service.sentMessages.length = 0;

    const backResult = await runTool(eosDirectSelectPageTool, { bank_index: 4, delta: -5 });
    expect(service.sentMessages).toHaveLength(1);
    const backMessage = service.sentMessages[0];
    expect(backMessage.address).toBe(oscMappings.directSelects.bankPage);
    const backPayload = JSON.parse(String(backMessage.args?.[0]?.value));
    expect(backPayload).toEqual({ bank: 4, delta: -5 });

    const backData = (backResult.content as any[]).find((item) => item.type === 'object');
    expect(backData.data).toMatchObject({ previousPage: 3, page: 0 });

    service.sentMessages.length = 0;

    await runTool(eosDirectSelectPressTool, { bank_index: 4, button_index: 1, state: 0 });
    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0].address).toBe(`${oscMappings.directSelects.base}/4/0/1`);
  });

  it('supporte plusieurs types de cibles', async () => {
    const combinations = [
      { input: 'Chan', expected: 'Chan' },
      { input: 'FX', expected: 'FX' },
      { input: 'scene', expected: 'Scene' }
    ];

    for (const [index, combo] of combinations.entries()) {
      service.sentMessages.length = 0;
      await runTool(eosDirectSelectBankCreateTool, {
        bank_index: 10 + index,
        target_type: combo.input,
        button_count: 8,
        flexi_mode: false
      });

      expect(service.sentMessages).toHaveLength(1);
      const message = service.sentMessages[0];
      expect(message.address).toBe(oscMappings.directSelects.bankCreate);
      const payload = JSON.parse(String(message.args?.[0]?.value));
      expect(payload.target).toBe(combo.expected);
    }
  });

  it('refuse un appui hors limites', async () => {
    await runTool(eosDirectSelectBankCreateTool, {
      bank_index: 6,
      target_type: 'Macro',
      button_count: 10,
      flexi_mode: false
    });

    await expect(
      runTool(eosDirectSelectPressTool, { bank_index: 6, button_index: 11, state: 1 })
    ).rejects.toThrow('depasse');
  });

  it('rejette un type de cible invalide', async () => {
    await expect(
      runTool(eosDirectSelectBankCreateTool, {
        bank_index: 1,
        target_type: 'invalid',
        button_count: 5,
        flexi_mode: false
      })
    ).rejects.toThrow('Type de cible invalide');
  });
});
