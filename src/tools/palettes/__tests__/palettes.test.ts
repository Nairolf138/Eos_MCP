/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';
import {
    eosBeamPaletteFireTool,
    eosColorPaletteFireTool,
    eosFocusPaletteFireTool,
    eosIntensityPaletteFireTool
} from '../index';

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

describe('palette tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });


  it('retourne une simulation en dry_run pour un declenchement palette', async () => {
    const result = await runTool(eosColorPaletteFireTool, { palette_number: 42, dry_run: true });
    expect(service.sentMessages).toHaveLength(0);
    expect(getStructuredContent(result)).toMatchObject({
      action: 'palette_fire',
      dry_run: true,
      osc: { address: oscMappings.palettes.color.fire }
    });
  });

  it('bloque un declenchement palette sans confirmation explicite', async () => {
    await expect(runTool(eosColorPaletteFireTool, { palette_number: 42 })).rejects.toThrow('Action sensible bloquee');
    expect(service.sentMessages).toHaveLength(0);
  });

  it('envoie un argument numerique lors du declenchement dune palette', async () => {
    await runTool(eosColorPaletteFireTool, { palette_number: 42, require_confirmation: true });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.palettes.color.fire);
    expect(message.args).toHaveLength(1);
    expect(message.args?.[0]).toMatchObject({ type: 'i', value: 42 });
  });
  it('declenche chaque type de palette avec le bon mapping', async () => {
    await runTool(eosIntensityPaletteFireTool, { palette_number: 1, require_confirmation: true });
    await runTool(eosFocusPaletteFireTool, { palette_number: 2, require_confirmation: true });
    await runTool(eosBeamPaletteFireTool, { palette_number: 3, require_confirmation: true });

    expect(service.sentMessages).toHaveLength(3);
    const addresses = service.sentMessages.map((message) => message.address);
    expect(addresses).toEqual([
      oscMappings.palettes.intensity.fire,
      oscMappings.palettes.focus.fire,
      oscMappings.palettes.beam.fire
    ]);
  });
});
