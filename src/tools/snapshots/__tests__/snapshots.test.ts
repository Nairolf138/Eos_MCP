import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import { eosSnapshotGetInfoTool, eosSnapshotRecallTool } from '../index';

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

describe('snapshot tools', () => {
  let service: FakeOscService;

  const runTool = async (tool: any, args: unknown, extra: unknown = {}): Promise<any> => {
    const handler = tool.handler as ToolHandler;
    return handler(args, extra);
  };

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie l'ordre de rappel avec le numero de snapshot", async () => {
    await runTool(eosSnapshotRecallTool, { snapshot_number: 5 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.snapshots.recall);
    expect(message.args).toHaveLength(1);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ snapshot: 5 });
  });

  it('valide la borne inferieure du numero de snapshot', async () => {
    await expect(runTool(eosSnapshotRecallTool, { snapshot_number: 0 })).rejects.toThrow();
  });

  it('permet d\'enclencher plusieurs rappels consecutifs', async () => {
    await runTool(eosSnapshotRecallTool, { snapshot_number: 3 });
    await runTool(eosSnapshotRecallTool, { snapshot_number: 7 });

    expect(service.sentMessages).toHaveLength(2);
    const [first, second] = service.sentMessages;
    const firstPayload = JSON.parse(String(first.args?.[0]?.value ?? '{}'));
    const secondPayload = JSON.parse(String(second.args?.[0]?.value ?? '{}'));
    expect(firstPayload).toMatchObject({ snapshot: 3 });
    expect(secondPayload).toMatchObject({ snapshot: 7 });
  });

  it('normalise les informations recues pour un snapshot et son UID', async () => {
    const promise = runTool(eosSnapshotGetInfoTool, { snapshot_number: 12 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        snapshot: {
          number: '12',
          label: 'Ballet Acte II',
          uid: '1.2.3.4.5'
        }
      };

      service.emit({
        address: oscMappings.snapshots.info,
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
    expect(textContent.text).toBe('Snapshot 12 "Ballet Acte II" (UID 1.2.3.4.5).');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();
    expect(objectContent.data).toMatchObject({
      status: 'ok',
      snapshot: {
        snapshot_number: 12,
        label: 'Ballet Acte II',
        uid: '1.2.3.4.5'
      }
    });
  });

  it('signale une erreur lorsque le snapshot est introuvable', async () => {
    const promise = runTool(eosSnapshotGetInfoTool, { snapshot_number: 99 });

    queueMicrotask(() => {
      const payload = {
        status: 'error',
        message: 'Snapshot missing'
      };

      service.emit({
        address: oscMappings.snapshots.info,
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
    expect(textContent.text).toBe('Snapshot 99 introuvable.');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      status: 'error',
      error: 'Snapshot missing',
      snapshot: {
        snapshot_number: 99,
        label: null,
        uid: null
      }
    });
  });
});
