/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosAddressSelectTool,
  eosAddressSetLevelTool,
  eosAddressSetDmxTool
} from '../index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

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

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('selectionne une adresse DMX en OSC natif', async () => {
    const result = await runTool(eosAddressSelectTool, { address_number: '2/041' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]?.address).toBe(oscMappings.dmx.addressSelect);

    expect(service.sentMessages[0]?.args).toEqual([{ type: 's', value: '2/041' }]);

    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent.status).toBe('ok');
  });

  it('convertit full en 100% pour le niveau', async () => {
    await runTool(eosAddressSetLevelTool, { address_number: '1/001', level: 'full' });

    expect(service.sentMessages[0]?.address).toBe('/eos/addr/1%2F001');
    expect(service.sentMessages[0]?.args).toEqual([{ type: 'f', value: 100 }]);
  });

  it('transforme full en 255 pour la valeur DMX brute', async () => {
    await runTool(eosAddressSetDmxTool, {
      address_number: '1/120',
      dmx_value: 'full'
    });

    expect(service.sentMessages[0]?.address).toBe('/eos/addr/1%2F120/DMX');
    expect(service.sentMessages[0]?.args).toEqual([{ type: 'i', value: 255 }]);
  });

  it('refuse une valeur DMX hors plage', async () => {
    await expect(
      runTool(eosAddressSetDmxTool, { address_number: '1/050', dmx_value: 300 })
    ).rejects.toThrow(/comprise entre 0 et 255/);
  });
});
