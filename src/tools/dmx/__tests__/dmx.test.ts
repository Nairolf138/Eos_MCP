import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosAddressSelectTool,
  eosAddressSetLevelTool,
  eosAddressSetDmxTool
} from '../index';

type ToolHandler = (args: unknown, extra?: unknown) => Promise<any>;

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

describe('dmx address tools', () => {
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

  it('selectionne une adresse DMX et attend une confirmation', async () => {
    const promise = runTool(eosAddressSelectTool, { address_number: '2/041' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.dmx.addressSelect,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok' })
          }
        ]
      });
    });

    const result = await promise;

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe(oscMappings.dmx.addressSelect);

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ address: '2/041' });

    const objectContent = (result.content as Array<{ type: string; data?: any }>).find(
      (item) => item.type === 'object'
    );
    expect(objectContent?.data.status).toBe('ok');
  });

  it('convertit full en 100% pour le niveau', async () => {
    const promise = runTool(eosAddressSetLevelTool, { address_number: '1/001', level: 'full' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.dmx.addressLevel,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok' })
          }
        ]
      });
    });

    await promise;

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ level: 100 });
  });

  it('transforme full en 255 pour la valeur DMX brute', async () => {
    const promise = runTool(eosAddressSetDmxTool, {
      address_number: '1/120',
      dmx_value: 'full'
    });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.dmx.addressDmx,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok' })
          }
        ]
      });
    });

    await promise;

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ value: 255 });
  });

  it('refuse une valeur DMX hors plage', async () => {
    await expect(
      runTool(eosAddressSetDmxTool, { address_number: '1/050', dmx_value: 300 })
    ).rejects.toThrow(/comprise entre 0 et 255/);
  });
});
