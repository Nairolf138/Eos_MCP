import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  __resetFaderBankCacheForTests,
  eosFaderBankCreateTool,
  eosFaderSetLevelTool,
  eosFaderLoadTool,
  eosFaderUnloadTool,
  eosFaderPageTool
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
}

const runTool = async (tool: any, args: unknown): Promise<any> => {
  const handler = tool.handler as unknown as (input: unknown, extra?: unknown) => Promise<any>;
  return handler(args, {});
};

describe('fader tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    __resetFaderBankCacheForTests();
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('cree un bank et initialise le cache', async () => {
    await runTool(eosFaderBankCreateTool, { bank_index: 2, fader_count: 12, page_number: 3 });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message).toMatchObject({ address: oscMappings.faders.bankCreate });

    const payloadArg = message.args?.[0];
    expect(payloadArg).toMatchObject({ type: 's' });

    const payload = JSON.parse(String(payloadArg?.value));
    expect(payload).toEqual({ bank: 2, faders: 12, page: 3 });
  });

  it('normalise les niveaux et respecte la page courante', async () => {
    await runTool(eosFaderBankCreateTool, { bank_index: 1, fader_count: 10, page_number: 2 });
    service.sentMessages.length = 0;

    await runTool(eosFaderSetLevelTool, { bank_index: 1, fader_index: 4, level: '50%' });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe(`${oscMappings.faders.base}/1/2/4`);
    expect(message.args?.[0]).toMatchObject({ type: 'f', value: 0.5 });
  });

  it('maintient la pagination pour load et unload', async () => {
    await runTool(eosFaderBankCreateTool, { bank_index: 3, fader_count: 6, page_number: 0 });
    await runTool(eosFaderPageTool, { bank_index: 3, delta: 2 });
    await runTool(eosFaderPageTool, { bank_index: 3, delta: 1 });

    const pageResult = await runTool(eosFaderPageTool, { bank_index: 3, delta: -2 });
    const pageData = (pageResult.content as any[]).find((item) => item.type === 'object');
    expect(pageData.data).toMatchObject({ page: 1 });

    service.sentMessages.length = 0;

    await runTool(eosFaderSetLevelTool, { bank_index: 3, fader_index: 1, level: 0.75 });
    await runTool(eosFaderLoadTool, { bank_index: 3, fader_index: 1 });
    await runTool(eosFaderUnloadTool, { bank_index: 3, fader_index: 1 });

    expect(service.sentMessages).toHaveLength(3);
    expect(service.sentMessages[0].address).toBe(`${oscMappings.faders.base}/3/1/1`);
    expect(service.sentMessages[0].args?.[0]).toMatchObject({ type: 'f', value: 0.75 });
    expect(service.sentMessages[1].address).toBe(`${oscMappings.faders.base}/3/1/1/load`);
    expect(service.sentMessages[2].address).toBe(`${oscMappings.faders.base}/3/1/1/unload`);
  });

  it('initialise un bank par defaut lors de la pagination', async () => {
    const result = await runTool(eosFaderPageTool, { bank_index: 7, delta: 1 });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe(oscMappings.faders.bankPage);

    const payload = JSON.parse(String(message.args?.[0]?.value));
    expect(payload).toEqual({ bank: 7, delta: 1 });

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({ previousPage: 0, page: 1 });
  });
});
