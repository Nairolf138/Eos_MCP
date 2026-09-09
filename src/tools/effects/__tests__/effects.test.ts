/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { ZodError } from 'zod';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { runTool } from '../../__tests__/helpers/runTool';
import {
    eosEffectGetInfoTool,
    eosEffectSelectTool,
    eosEffectStopTool
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

describe('effect tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie la selection d'effet avec le numero attendu", async () => {
    await runTool(eosEffectSelectTool, { effect_number: 12 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.select });

    expect(service.sentMessages[0]?.args).toEqual([
      { type: 'i', value: 12 }
    ]);
  });

  it("envoie l'ordre d'arret avec le numero d'effet si fourni", async () => {
    await runTool(eosEffectStopTool, { effect_number: 7 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.stop });

    expect(service.sentMessages[0]?.args).toEqual([
      { type: 's', value: 'Effect 7 At#' }
    ]);
  });

  it("envoie un arret generique lorsque aucun numero n'est fourni", async () => {
    await runTool(eosEffectStopTool, {});

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.effects.stop });

    expect(service.sentMessages[0]?.args).toEqual([
      { type: 's', value: 'Stop_Effect#' }
    ]);
  });
  it('valide le numero effet requis', async () => {
    await expect(runTool(eosEffectSelectTool, { effect_number: 0 })).rejects.toThrow(ZodError);
    await expect(runTool(eosEffectGetInfoTool, { effect_number: 0 })).rejects.toThrow(ZodError);
  });
});
