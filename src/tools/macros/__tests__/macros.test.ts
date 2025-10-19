import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosMacroFireTool,
  eosMacroGetInfoTool,
  eosMacroSelectTool
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

describe('macro tools', () => {
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

  it('envoie l\'ordre de declenchement d\'une macro', async () => {
    await runTool(eosMacroFireTool, { macro_number: 7 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.macros.fire });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ macro: 7 });
  });

  it('envoie la selection de macro avec le numero attendu', async () => {
    await runTool(eosMacroSelectTool, { macro_number: 5 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.macros.select });

    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toMatchObject({ macro: 5 });
  });

  it('normalise les informations renvoyees pour une macro', async () => {
    const promise = runTool(eosMacroGetInfoTool, { macro_number: 12 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        macro: {
          number: '12',
          label: 'Blackout',
          mode: 'Text',
          commands: [
            'Chan 1 Thru 10 @ 0',
            { text: 'Enter' },
            { value: 'Clear_CmdLine' }
          ]
        }
      };

      service.emit({
        address: oscMappings.macros.info,
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
    expect(textContent.text).toBe('Macro 12 "Blackout" (3 commandes).');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    expect(objectContent.data).toMatchObject({
      status: 'ok',
      error: null,
      macro: {
        macro_number: 12,
        label: 'Blackout',
        mode: 'Text',
        commands: [
          { index: 1, text: 'Chan 1 Thru 10 @ 0' },
          { index: 2, text: 'Enter' },
          { index: 3, text: 'Clear_CmdLine' }
        ],
        script_text: 'Chan 1 Thru 10 @ 0\nEnter\nClear_CmdLine'
      }
    });
  });

  it('signale une erreur lorsque la macro est introuvable', async () => {
    const promise = runTool(eosMacroGetInfoTool, { macro_number: 99 });

    queueMicrotask(() => {
      const payload = {
        status: 'error',
        message: 'Macro not found'
      };

      service.emit({
        address: oscMappings.macros.info,
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
    expect(textContent.text).toBe('Macro 99 introuvable.');

    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent.data).toMatchObject({
      status: 'error',
      error: 'Macro not found',
      macro: {
        macro_number: 99,
        label: null,
        mode: null,
        commands: [],
        script_text: ''
      }
    });
  });
});
