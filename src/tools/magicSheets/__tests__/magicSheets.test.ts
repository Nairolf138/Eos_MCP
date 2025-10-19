import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosMagicSheetGetInfoTool,
  eosMagicSheetOpenTool,
  eosMagicSheetSendStringTool
} from '../index';

type ToolHandler = (args: unknown, extra?: unknown) => Promise<any>;

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

describe('magic sheet tools', () => {
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

  it("envoie l'ordre d'ouverture avec le numero et la vue", async () => {
    await runTool(eosMagicSheetOpenTool, { ms_number: 5, view_number: 2 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.magicSheets.open);
    expect(message.args).toHaveLength(1);
    const payload = JSON.parse(String(message.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ number: 5, view: 2 });
  });

  it('envoie une commande texte lorsque le role est Primary', async () => {
    await runTool(
      eosMagicSheetSendStringTool,
      { osc_command: '/hog/playback/go' },
      { connection: { role: 'Primary' } }
    );

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.magicSheets.sendString);
    expect(message.args).toEqual([
      {
        type: 's',
        value: '/hog/playback/go'
      }
    ]);
  });

  it("refuse l'envoi lorsqu'il ne s'agit pas d'une connexion Primary", async () => {
    const result = await runTool(
      eosMagicSheetSendStringTool,
      { osc_command: '/hog/playback/go' },
      { connection: { role: 'Secondary' } }
    );

    expect(service.sentMessages).toHaveLength(0);
    const textContent = (result.content as any[]).find((item) => item.type === 'text');
    expect(textContent.text).toContain('connexion Primary');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      action: 'magic_sheet_send_string',
      required_role: 'Primary',
      provided_role: 'Secondary'
    });
  });

  it('normalise les informations retournees par la console', async () => {
    const promise = runTool(eosMagicSheetGetInfoTool, { ms_number: 7 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        magic_sheet: {
          number: '7',
          label: 'Plan de face',
          uid: '123e4567-e89b-12d3-a456-426614174000'
        }
      };

      service.emit({
        address: oscMappings.magicSheets.info,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[]).find((item) => item.type === 'object');

    expect(objectContent.data).toMatchObject({
      status: 'ok',
      magic_sheet: {
        ms_number: 7,
        label: 'Plan de face',
        uid: '123e4567-e89b-12d3-a456-426614174000'
      }
    });
  });

  it('signale une erreur lorsque le magic sheet est introuvable', async () => {
    const promise = runTool(eosMagicSheetGetInfoTool, { ms_number: 42 });

    queueMicrotask(() => {
      const payload = {
        status: 'error',
        message: 'Magic sheet not found'
      };

      service.emit({
        address: oscMappings.magicSheets.info,
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
    expect(textContent.text).toContain('introuvable');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      status: 'error',
      magic_sheet: {
        ms_number: 42
      },
      error: 'Magic sheet not found'
    });
  });
});
