/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
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

describe('show control tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });
  it('refuse les placeholders invalides pour le format d\'envoi', async () => {
    await expect(runTool(eosSetCueSendStringTool, { format_string: 'Cue %6' })).rejects.toThrow(
      /Placeholder %6 invalide/
    );
  });
  it('refuse les placeholders invalides pour la reception', async () => {
    await expect(runTool(eosSetCueReceiveStringTool, { format_string: 'Receive %3' })).rejects.toThrow(
      /Placeholder %3 invalide/
    );
  });
});
