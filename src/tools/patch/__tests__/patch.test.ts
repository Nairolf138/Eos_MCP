/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { getResourceCache } from '../../../services/cache/index';
import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import eosPayloadVariants from '../../../services/osc/__tests__/fixtures/eos-query-payload-variants.json';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosPatchGetAugment3dBeamTool,
  eosPatchGetAugment3dPositionTool,
  eosPatchGetChannelInfoTool
} from '../index';
import type { ToolExecutionResult } from '../../types';
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

function extractStructuredContent(result: ToolExecutionResult): Record<string, unknown> | null {
  return getStructuredContent(result) ?? null;
}

describe('patch tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    getResourceCache().clearAll();
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
    getResourceCache().clearAll();
  });


  it('retourne la requete patch calculee en dry_run', async () => {
    const result = await runTool(eosPatchGetChannelInfoTool, { channel_number: 101, dry_run: true });
    expect(service.sentMessages).toHaveLength(0);
    expect(extractStructuredContent(result)).toMatchObject({
      action: 'patch_get_channel_info',
      dry_run: true,
      osc: { address: oscMappings.patch.channelInfo }
    });
  });
  it('propage les diagnostics OSC et le message console pour timeout, payload texte, payload vide et JSON invalide', async () => {
    const timeoutResult = await runTool(eosPatchGetChannelInfoTool, {
      channel_number: 301,
      timeoutMs: 50
    });
    const timeoutContent = extractStructuredContent(timeoutResult);
    expect(timeoutContent).toMatchObject({
      status: 'timeout',
      diagnostics: {
        requestAddress: oscMappings.patch.channelInfo,
        responseAddress: null,
        timeoutMs: 50,
        payloadType: 'empty'
      }
    });
    expect(timeoutResult.content?.[0]?.type).toBe('text');
    expect(timeoutResult.content?.[0]?.text).toContain('OSC RX activé');

    const cases = [
      { channel: 302, value: 'not json', payloadType: 'plain_text' },
      { channel: 303, value: '', payloadType: 'empty' },
      { channel: 304, value: '{"status":', payloadType: 'invalid_json' }
    ] as const;

    for (const testCase of cases) {
      const promise = runTool(eosPatchGetChannelInfoTool, {
        channel_number: testCase.channel,
        timeoutMs: 50
      });

      queueMicrotask(() => {
        service.emit({
          address: oscMappings.patch.channelInfo,
          args: [{ type: 's', value: testCase.value }]
        });
      });

      const result = await promise;
      const structuredContent = extractStructuredContent(result);
      expect(structuredContent).toMatchObject({
        status: 'error',
        diagnostics: {
          requestAddress: oscMappings.patch.channelInfo,
          responseAddress: oscMappings.patch.channelInfo,
          timeoutMs: 50,
          payloadType: testCase.payloadType
        }
      });
      expect(result.content?.[0]?.text).toContain('ports UDP 8000/8001 ou TCP 3032 cohérents');
    }
  });

  it('valide les numeros de canal et de partie', async () => {
    await expect(runTool(eosPatchGetChannelInfoTool, { channel_number: 0, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dPositionTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
    await expect(runTool(eosPatchGetAugment3dBeamTool, { channel_number: 1, part_number: 0 })).rejects.toThrow();
  });
});
