/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { getResourceCache } from '../../../services/cache/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { runTool } from '../../__tests__/helpers/runTool';
import {
    eosGroupSelectTool,
    eosGroupSetLevelTool
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

describe('group tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    getResourceCache().clearAll();
  });

  afterEach(() => {
    setOscClient(null);
    getResourceCache().clearAll();
  });

  it('envoie la selection de groupe avec le numero attendu', async () => {
    await runTool(eosGroupSelectTool, { group_number: 5 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.groups.select });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'i', value: 5 });
  });

  it('convertit le mot-cle full en 100 pour le reglage de niveau', async () => {
    await runTool(eosGroupSetLevelTool, { group_number: 12, level: 'full' });

    expect(service.sentMessages).toHaveLength(1);
    const expectedAddress = oscMappings.groups.level.replace('{group}', '12');
    expect(service.sentMessages[0]).toMatchObject({ address: expectedAddress });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'f', value: 100 });
  });
});
