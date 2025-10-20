import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosGetShowNameTool,
  eosGetLiveBlindStateTool,
  eosToggleStagingModeTool,
  eosSetCueSendStringTool,
  eosSetCueReceiveStringTool
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

describe('show control tools', () => {
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

  it('recupere le nom du show', async () => {
    const promise = runTool(eosGetShowNameTool, {});

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.showName,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', show: 'Festival 2024' })
          }
        ]
      });
    });

    const result = await promise;

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe(oscMappings.showControl.showName);

    const textContent = (result.content as Array<{ type: string; text?: string }>).find(
      (item) => item.type === 'text'
    );
    expect(textContent?.text).toContain('Festival 2024');

    const objectContent = (result.content as Array<{ type: string; data?: any }>).find(
      (item) => item.type === 'object'
    );
    expect(objectContent?.data.show_name).toBe('Festival 2024');
  });

  it('normalise et valide le mode Live/Blind', async () => {
    const promise = runTool(eosGetLiveBlindStateTool, {});

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.liveBlindState,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', state: 0 })
          }
        ]
      });
    });

    const result = await promise;
    const textContent = (result.content as Array<{ type: string; text?: string }>).find(
      (item) => item.type === 'text'
    );
    expect(textContent?.text).toContain('Blind');

    const objectContent = (result.content as Array<{ type: string; data?: any }>).find(
      (item) => item.type === 'object'
    );
    expect(objectContent?.data.state).toEqual({ numeric: 0, label: 'Blind' });
  });

  it('renvoie une erreur lisible quand le mode Live/Blind est invalide', async () => {
    const promise = runTool(eosGetLiveBlindStateTool, {});

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.liveBlindState,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', state: 5 })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as Array<{ type: string; data?: any }>).find(
      (item) => item.type === 'object'
    );
    expect(objectContent?.data.error).toContain('Etat Live/Blind invalide');
  });

  it('bascule le mode staging et retourne un accusé', async () => {
    const promise = runTool(eosToggleStagingModeTool, {});

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.toggleStagingMode,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok', staging: 'toggled' })
          }
        ]
      });
    });

    const result = await promise;
    expect(service.sentMessages[0]?.address).toBe(oscMappings.showControl.toggleStagingMode);
    const textContent = (result.content as Array<{ type: string; text?: string }>).find(
      (item) => item.type === 'text'
    );
    expect(textContent?.text).toContain('Mode staging bascule');
  });

  it('valide et configure le format d\'envoi des cues', async () => {
    const promise = runTool(eosSetCueSendStringTool, { format_string: 'Cue %1 -> %2 (%3)' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.setCueSendString,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok' })
          }
        ]
      });
    });

    const result = await promise;
    expect(service.sentMessages[0]?.address).toBe(oscMappings.showControl.setCueSendString);
    const payload = JSON.parse(String(service.sentMessages[0]?.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ format: 'Cue %1 -> %2 (%3)' });

    const objectContent = (result.content as Array<{ type: string; data?: any }>).find(
      (item) => item.type === 'object'
    );
    expect(objectContent?.data.format).toBe('Cue %1 -> %2 (%3)');
  });

  it('refuse les placeholders invalides pour le format d\'envoi', async () => {
    await expect(runTool(eosSetCueSendStringTool, { format_string: 'Cue %6' })).rejects.toThrow(
      /Placeholder %6 invalide/
    );
  });

  it('valide le format de reception des cues', async () => {
    const promise = runTool(eosSetCueReceiveStringTool, { format_string: 'Receive %1 [%2]' });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.setCueReceiveString,
        args: [
          {
            type: 's',
            value: JSON.stringify({ status: 'ok' })
          }
        ]
      });
    });

    await promise;
    const lastMessage = service.sentMessages[service.sentMessages.length - 1];
    const payload = JSON.parse(String(lastMessage?.args?.[0]?.value ?? '{}'));
    expect(payload).toEqual({ format: 'Receive %1 [%2]' });
  });

  it('refuse les placeholders invalides pour la reception', async () => {
    await expect(runTool(eosSetCueReceiveStringTool, { format_string: 'Receive %3' })).rejects.toThrow(
      /Placeholder %3 invalide/
    );
  });
});
