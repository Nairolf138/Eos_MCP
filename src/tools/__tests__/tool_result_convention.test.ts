/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { eosCommandTool } from '../commands/command_tools';
import { eosCueGoTool } from '../cues';
import { eosAddressSelectTool } from '../dmx';
import { eosMacroFireTool } from '../macros';
import { eosPatchGetChannelInfoTool } from '../patch';
import { eosPixmapSelectTool } from '../pixelMaps';
import { eosGetShowNameTool } from '../showControl';
import { getStructuredContent, runTool } from './helpers/runTool';

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

function readableEnvelope(result: Awaited<ReturnType<typeof runTool>>): Record<string, unknown> {
  const structuredContent = getStructuredContent(result);
  if (!structuredContent) {
    throw new Error('Expected structured content');
  }

  return {
    text: result.content[0]?.text,
    status: structuredContent.status,
    summary: structuredContent.summary,
    commandsSent: structuredContent.commandsSent,
    commands_preview: structuredContent.commands_preview,
    warnings: structuredContent.warnings,
    next_actions: structuredContent.next_actions,
    source: structuredContent.source,
    confidence: structuredContent.confidence,
    is_complete: structuredContent.is_complete,
    limitations: structuredContent.limitations,
    next_operator_actions: structuredContent.next_operator_actions
  };
}

describe('tool result convention snapshots', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    setOscClient(new OscClient(service, { defaultTimeoutMs: 50 }));
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('standardise les resumes lisibles des familles prioritaires', async () => {
    const dmxPromise = runTool(eosAddressSelectTool, { address_number: '2/041' });
    queueMicrotask(() => {
      service.emit({
        address: oscMappings.dmx.addressSelect,
        args: [{ type: 's', value: JSON.stringify({ status: 'ok' }) }]
      });
    });

    const showNamePromise = runTool(eosGetShowNameTool, {});
    queueMicrotask(() => {
      service.emit({
        address: oscMappings.showControl.showName,
        args: [{ type: 's', value: JSON.stringify({ status: 'ok', show: 'Festival 2026' }) }]
      });
    });

    const patchPromise = runTool(eosPatchGetChannelInfoTool, { channel_number: 12 });
    queueMicrotask(() => {
      service.emit({
        address: oscMappings.patch.channelInfo,
        args: [{ type: 's', value: JSON.stringify({ status: 'ok', channel: { channel: 12, parts: [] } }) }]
      });
    });

    const results = {
      commands: readableEnvelope(await runTool(eosCommandTool, { command: 'Go To Cue 9', dry_run: true, user: 3 })),
      cues: readableEnvelope(await runTool(eosCueGoTool, { cuelist_number: 5 })),
      patch: readableEnvelope(await patchPromise),
      dmx: readableEnvelope(await dmxPromise),
      macros: readableEnvelope(await runTool(eosMacroFireTool, { macro_number: 7 })),
      pixelMaps: readableEnvelope(await runTool(eosPixmapSelectTool, { pixmap_number: 4 })),
      showControl: readableEnvelope(await showNamePromise)
    };

    expect(results).toMatchSnapshot();
  });
});
