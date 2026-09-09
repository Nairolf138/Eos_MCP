/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { runTool } from '../../__tests__/helpers/runTool';
import {
    eosChannelSelectTool,
    eosChannelSetLevelTool,
    eosSetDmxTool
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

describe('channel tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('convertit le mot-cle out en niveau 0 avant envoi', async () => {
    await runTool(eosChannelSetLevelTool, { channels: [1, 2], level: 'out' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.commands.newCommand });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 2 Sneak 0#');
  });

  it('accepte les numeros de canal fournis en chaine', async () => {
    await runTool(eosChannelSetLevelTool, { channels: ['001', '002'], level: 50 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.commands.newCommand });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 2 Sneak 50#');
  });

  it('prefere une selection exclusive sans suffixe', async () => {
    await runTool(eosChannelSelectTool, { channels: [1, 2], exclusive: true });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.commands.newCommand });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 2#');
  });

  it('utilise la forme Chan + pour ajouter a la selection', async () => {
    await runTool(eosChannelSelectTool, { channels: [1, 2] });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.commands.newCommand });

    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan + 1 Thru 2#');
  });


  it('accepte les plages de canaux en format texte FR/EN', async () => {
    await runTool(eosChannelSetLevelTool, { channels: 'Chan 1-3 et 5', level: 25 });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message?.args?.[0]?.value).toBe('Chan 1 Thru 3 + 5 Sneak 25#');
  });

  it('transforme full en 255 pour le DMX', async () => {
    await runTool(eosSetDmxTool, { addresses: [101], value: 'full' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: '/eos/addr/101/DMX' });

    const message = service.sentMessages[0];
    expect(message?.args).toEqual([{ type: 'i', value: 255 }]);
  });

  it('accepte les adresses DMX en chaine', async () => {
    await runTool(eosSetDmxTool, { addresses: ['010', '011'], value: 10 });

    expect(service.sentMessages).toEqual([
      { address: '/eos/addr/10/DMX', args: [{ type: 'i', value: 10 }] },
      { address: '/eos/addr/11/DMX', args: [{ type: 'i', value: 10 }] }
    ]);
  });


  it('accepte les plages d adresses DMX en format texte', async () => {
    await runTool(eosSetDmxTool, { addresses: 'Address 101-103', value: 10 });

    expect(service.sentMessages).toEqual([
      { address: '/eos/addr/101/DMX', args: [{ type: 'i', value: 10 }] },
      { address: '/eos/addr/102/DMX', args: [{ type: 'i', value: 10 }] },
      { address: '/eos/addr/103/DMX', args: [{ type: 'i', value: 10 }] }
    ]);
  });

  describe('eos_channel_get_info', () => {
  });
});
