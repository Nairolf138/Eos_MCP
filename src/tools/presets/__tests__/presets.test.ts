/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosPresetFireTool,
  eosPresetSelectTool,
  eosPresetGetInfoTool
} from '../index';
import { getStructuredContent, isTextContent, runTool } from '../../__tests__/helpers/runTool';

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

function assertHasPresetDetails(
  data: Record<string, unknown>
): asserts data is {
  action: string;
  status: string;
  preset: {
    exists: true;
    flags: Record<string, boolean>;
    effects: unknown[];
    channels: unknown[];
  };
} {
  const preset = (data as { preset?: unknown }).preset;
  if (typeof preset !== 'object' || preset === null) {
    throw new Error('Expected preset details');
  }

  const presetData = preset as {
    exists?: unknown;
    flags?: unknown;
    effects?: unknown;
    channels?: unknown;
  };

  if (presetData.exists !== true) {
    throw new Error('Preset expected to exist');
  }

  if (
    typeof presetData.flags !== 'object' ||
    presetData.flags === null ||
    !Array.isArray(presetData.effects) ||
    !Array.isArray(presetData.channels)
  ) {
    throw new Error('Preset details missing expected properties');
  }
}

describe('preset tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('envoie le declenchement de preset avec le numero attendu', async () => {
    await runTool(eosPresetFireTool, { preset_number: 7 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.presets.fire });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'i', value: 7 });
  });

  it('envoie la selection de preset avec le numero attendu', async () => {
    await runTool(eosPresetSelectTool, { preset_number: 9 });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: oscMappings.presets.select });

    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'i', value: 9 });
  });
});
