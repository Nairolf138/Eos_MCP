import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import {
  eosCommandTool,
  eosNewCommandTool,
  eosCommandWithSubstitutionTool,
  eosGetCommandLineTool
} from '../command_tools';

describe('command tools', () => {
  class FakeOscService implements OscGateway {
    public readonly sentMessages: OscMessage[] = [];

    private readonly listeners = new Set<(message: OscMessage) => void>();

    public send(message: OscMessage, _targetAddress?: string, _targetPort?: number): void {
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

  it('envoie une commande en respectant le terminateur', async () => {
    const result = await runTool(eosCommandTool, { command: 'Chan 1', terminateWithEnter: true, user: 2 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/cmd',
      args: [
        { type: 's', value: 'Chan 1#' },
        { type: 'i', value: 2 }
      ]
    });

    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();
  });

  it('applique la substitution et efface la ligne pour eos_new_command', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Group %1 At %2',
      substitutions: [5, 'Full'],
      clearLine: true,
      terminateWithEnter: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/newcmd',
      args: [
        { type: 's', value: 'Group 5 At Full#' }
      ]
    });
  });

  it('peut envoyer un new_command sans effacement prealable', async () => {
    await runTool(eosNewCommandTool, {
      command: 'Chan %1 At 50',
      substitutions: [1],
      clearLine: false
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe('/eos/cmd');
  });

  it('envoie une commande via gabarit avec substitutions numerotees', async () => {
    await runTool(eosCommandWithSubstitutionTool, {
      template: 'Cue %1/%2 Go',
      values: [1, 2],
      terminateWithEnter: true
    });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({
      address: '/eos/cmd',
      args: [
        { type: 's', value: 'Cue 1/2 Go#' }
      ]
    });
  });

  it('recupere la ligne de commande et decode le numero utilisateur', async () => {
    const promise = runTool(eosGetCommandLineTool, { user: 4 });

    queueMicrotask(() => {
      service.emit({
        address: '/eos/get/cmd_line',
        args: [
          {
            type: 's',
            value: JSON.stringify({ text: 'Chan 1 At 50', user: 'User 4' })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');

    expect(objectContent).toBeDefined();
    expect((objectContent as { type: string; data: unknown }).data).toMatchObject({
      status: 'ok',
      text: 'Chan 1 At 50',
      user: 4
    });

    expect(service.sentMessages[0]).toMatchObject({ address: '/eos/get/cmd_line' });
  });
});
