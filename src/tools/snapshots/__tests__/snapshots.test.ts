/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { runTool } from '../../__tests__/helpers/runTool';
import { eosSnapshotRecallTool } from '../index';

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

describe('snapshot tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie l'ordre de rappel avec le numero de snapshot", async () => {
    await runTool(eosSnapshotRecallTool, { snapshot_number: 5 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.snapshots.recall);
    expect(message.args).toHaveLength(1);
    const payload = ({ snapshot: message.args?.[0]?.value });
    expect(payload).toMatchObject({ snapshot: 5 });
  });

  it('valide la borne inferieure du numero de snapshot', async () => {
    await expect(runTool(eosSnapshotRecallTool, { snapshot_number: 0 })).rejects.toThrow();
  });

  it('permet d\'enclencher plusieurs rappels consecutifs', async () => {
    await runTool(eosSnapshotRecallTool, { snapshot_number: 3 });
    await runTool(eosSnapshotRecallTool, { snapshot_number: 7 });

    expect(service.sentMessages).toHaveLength(2);
    const [first, second] = service.sentMessages;
    expect(first.args).toEqual([{ type: 'i', value: 3 }]);
    expect(second.args).toEqual([{ type: 'i', value: 7 }]);
  });
});
