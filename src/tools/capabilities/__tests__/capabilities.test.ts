/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  setOscClient,
  type OscClient
} from '../../../services/osc/client';
import { OscConnectionStateProvider } from '../../../services/osc/connectionState';
import { setCurrentUserId, clearCurrentUserId } from '../../session';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';
import { eosCapabilitiesGetTool } from '../index';
import { setCapabilitiesToolNamesProvider } from '../context';
import { oscMappings } from '../../../services/osc/mappings';

class FakeConnectionAwareClient {
  public readonly connectionProvider = new OscConnectionStateProvider();

  public getConnectionStateProvider(): OscConnectionStateProvider {
    return this.connectionProvider;
  }

  public requestJson = jest.fn(async (address: string) => {
    if (address === oscMappings.showControl.liveBlindState) {
      return { status: 'ok', data: { status: 'ok', state: 'live' }, payload: null };
    }
    if (address === oscMappings.system.getVersion) {
      return { status: 'ok', data: { status: 'ok', version: '3.2.1' }, payload: null };
    }

    return { status: 'ok', data: null, payload: null };
  });
}

describe('eos_capabilities_get', () => {
  let client: FakeConnectionAwareClient;

  beforeEach(() => {
    client = new FakeConnectionAwareClient();
    setOscClient(client as unknown as OscClient);

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
    const result = await runTool(eosCapabilitiesGetTool, {});
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
    expect(structured.osc_compatibility.context.eos_version).toBe('3.2.1');
    expect(structured.osc_compatibility.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'eos_cue_go',
          min_eos_version: '3.0.0'
        })
      ])
    );
  });
});
