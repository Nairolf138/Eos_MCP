/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { getStructuredContent, isTextContent, runTool } from '../../__tests__/helpers/runTool';
import {
    eosMagicSheetOpenTool,
    eosMagicSheetSendStringTool
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

describe('magic sheet tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it("envoie l'ordre d'ouverture avec le numero et la vue", async () => {
    await runTool(eosMagicSheetOpenTool, { ms_number: 5, view_number: 2 });

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.magicSheets.open);
    expect(message.args).toEqual([
      { type: 'i', value: 5 },
      { type: 'i', value: 2 }
    ]);
  });

  it('envoie une commande texte lorsque le role est Primary', async () => {
    await runTool(
      eosMagicSheetSendStringTool,
      { osc_command: '/hog/playback/go' },
      { connection: { role: 'Primary' } }
    );

    expect(service.sentMessages).toHaveLength(1);
    const [message] = service.sentMessages;
    expect(message.address).toBe(oscMappings.magicSheets.sendString);
    expect(message.args).toEqual([
      {
        type: 's',
        value: '/hog/playback/go'
      }
    ]);
  });

  it("refuse l'envoi lorsqu'il ne s'agit pas d'une connexion Primary", async () => {
    const result = await runTool(
      eosMagicSheetSendStringTool,
      { osc_command: '/hog/playback/go' },
      { connection: { role: 'Secondary' } }
    );

    expect(service.sentMessages).toHaveLength(0);
    const textContent = result.content.find(isTextContent);
    expect(textContent).toBeDefined();
    if (!textContent) {
      throw new Error('Expected text content');
    }
    expect(textContent.text).toContain('connexion Primary');

    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toMatchObject({
      action: 'magic_sheet_send_string',
      required_role: 'Primary',
      provided_role: 'Secondary'
    });
  });
});
