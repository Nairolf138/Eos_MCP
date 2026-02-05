import type { OscMessage } from '../../../services/osc';
import {
  OscClient,
  setOscClient,
  type OscGateway,
  type OscGatewaySendOptions
} from '../../../services/osc/client';
import { OscConnectionStateProvider } from '../../../services/osc/connectionState';
import { setCurrentUserId, clearCurrentUserId } from '../../session';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';
import { eosCapabilitiesGetTool } from '../index';
import { setCapabilitiesToolNamesProvider } from '../context';
import { oscMappings } from '../../../services/osc/mappings';

class FakeGateway implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public readonly connectionProvider = new OscConnectionStateProvider();

  public async send(message: OscMessage, _options?: OscGatewaySendOptions): Promise<void> {
    this.sentMessages.push(message);
  }

  public onMessage(listener: (message: OscMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(message: OscMessage): void {
    this.listeners.forEach((listener) => listener(message));
  }

  public getConnectionStateProvider(): OscConnectionStateProvider {
    return this.connectionProvider;
  }
}

describe('eos_capabilities_get', () => {
  let gateway: FakeGateway;

  beforeEach(() => {
    gateway = new FakeGateway();
    const client = new OscClient(gateway, { defaultTimeoutMs: 50 });
    setOscClient(client);

    setCapabilitiesToolNamesProvider(() => [
      'eos_capabilities_get',
      'eos_cue_go',
      'eos_patch_get_channel_info',
      'eos_color_palette_fire',
      'session_get_current_user'
    ]);

    setCurrentUserId(7);
  });

  afterEach(() => {
    setOscClient(null);
    setCapabilitiesToolNamesProvider(null);
    clearCurrentUserId();
  });

  it('retourne les familles, le contexte et les infos serveur', async () => {
    const promise = runTool(eosCapabilitiesGetTool, {});

    queueMicrotask(() => {
      gateway.emit({
        address: oscMappings.showControl.liveBlindState,
        args: [{ type: 's', value: JSON.stringify({ status: 'ok', state: 'live' }) }]
      });
    });

    const result = await promise;
    const structured = getStructuredContent(result);

    expect(structured).toBeDefined();
    if (!structured) {
      throw new Error('Expected structured content');
    }

    expect(structured.capabilities.total_tools).toBe(5);
    expect(structured.capabilities.families.cues.tools).toContain('eos_cue_go');
    expect(structured.capabilities.families.patch.tools).toContain('eos_patch_get_channel_info');
    expect(structured.context.current_user).toBe(7);
    expect(structured.context.mode.live_blind).toBe('live');
    expect(structured.server.version).toBeDefined();
    expect(structured.server.compatibility.osc_protocol).toBe('ETCOSC');
  });
});
