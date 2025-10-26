import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  __resetDirectSelectBankCacheForTests,
  eosDirectSelectBankCreateTool,
  eosDirectSelectPageTool,
  eosDirectSelectPressTool
} from '../index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

function formatPattern(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Missing value for ${match}`);
    }
    return String(values[key]);
  });
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
}

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
    expect(message.address).toBe(
      formatPattern(oscMappings.directSelects.bankCreate, {
        index: 2,
        target: 'Group',
        buttons: 40,
        flexi: 1,
        page: 3
      })
    );
    expect(message.args ?? []).toEqual([]);

    service.sentMessages.length = 0;

    await runTool(eosDirectSelectPressTool, { bank_index: 2, button_index: 5, state: 1 });

    expect(service.sentMessages).toHaveLength(1);
    const pressMessage = service.sentMessages[0];
    expect(pressMessage.address).toBe(
      formatPattern(oscMappings.directSelects.base, {
        index: 2,
        page: 3,
        button: 5
      })
    );
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
    expect(forwardMessage.address).toBe(
      formatPattern(oscMappings.directSelects.bankPage, {
        index: 4,
        delta: 2
      })
    );
    expect(forwardMessage.args ?? []).toEqual([]);

    const forwardData = getStructuredContent(nextPageResult);
    expect(forwardData).toBeDefined();
    if (!forwardData) {
      throw new Error('Expected structured content');
    }
    expect(forwardData).toMatchObject({ previousPage: 1, page: 3 });

    service.sentMessages.length = 0;

    const backResult = await runTool(eosDirectSelectPageTool, { bank_index: 4, delta: -5 });
    expect(service.sentMessages).toHaveLength(1);
    const backMessage = service.sentMessages[0];
    expect(backMessage.address).toBe(
      formatPattern(oscMappings.directSelects.bankPage, {
        index: 4,
        delta: -5
      })
    );
    expect(backMessage.args ?? []).toEqual([]);

    const backData = getStructuredContent(backResult);
    expect(backData).toBeDefined();
    if (!backData) {
      throw new Error('Expected structured content');
    }
    expect(backData).toMatchObject({ previousPage: 3, page: 0 });

    service.sentMessages.length = 0;

    await runTool(eosDirectSelectPressTool, { bank_index: 4, button_index: 1, state: 0 });
    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0].address).toBe(
      formatPattern(oscMappings.directSelects.base, {
        index: 4,
        page: 0,
        button: 1
      })
    );
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
      expect(message.address).toBe(
        formatPattern(oscMappings.directSelects.bankCreate, {
          index: 10 + index,
          target: combo.expected,
          buttons: 8,
          flexi: 0,
          page: 0
        })
      );
      expect(message.args ?? []).toEqual([]);
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
