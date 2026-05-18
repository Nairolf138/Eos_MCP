/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { OscMessage } from '../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../services/osc/client';
import { oscPayloadAnnotations } from '../../services/osc/mappings';
import { eosCommandTool, eosNewCommandTool } from '../commands/command_tools';
import { eosChannelSetParameterTool } from '../channels/index';
import { eosAddressSetDmxTool } from '../dmx/index';
import { eosGroupSetLevelTool } from '../groups/index';
import { eosKeyPressTool } from '../keys/index';
import { eosFaderBankCreateTool } from '../faders/index';
import { eosDirectSelectBankCreateTool } from '../directSelects/index';
import { eosMagicSheetOpenTool } from '../magicSheets/index';
import { eosCueFireTool } from '../cues/fire';
import { eosEffectSelectTool, eosEffectStopTool } from '../effects/index';
import { eosSetCueReceiveStringTool, eosSetCueSendStringTool } from '../showControl/index';
import { runTool } from './helpers/runTool';

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

function snapshotLastMessage(service: FakeOscService, annotation: { wireFormat: string; arguments: string }): void {
  const message = service.sentMessages[service.sentMessages.length - 1];
  expect({
    address: message.address,
    wireFormat: annotation.wireFormat,
    arguments: annotation.arguments,
    args: message.args ?? []
  }).toMatchSnapshot();
}

describe('OSC payload snapshots', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('captures EOS-native command line payloads', async () => {
    await runTool(eosCommandTool, {
      command: 'Load Cue 20',
      terminateWithEnter: true,
      safety_level: 'standard'
    });
    snapshotLastMessage(service, oscPayloadAnnotations.commands.command);

    await runTool(eosNewCommandTool, {
      command: 'Record Cue 1',
      terminateWithEnter: true,
      require_confirmation: true
    });
    snapshotLastMessage(service, oscPayloadAnnotations.commands.newCommand);
  });

  it('captures JSON parameter payloads', async () => {
    await runTool(eosChannelSetParameterTool, { channels: [1, 2], parameter: 'pan', value: 45 });
    snapshotLastMessage(service, oscPayloadAnnotations.channels.parameter);

    await runTool(eosAddressSetDmxTool, { address_number: '1/101', dmx_value: 255 });
    snapshotLastMessage(service, oscPayloadAnnotations.dmx.addressDmx);
  });

  it('captures EOS-native effect command payloads', async () => {
    await runTool(eosEffectSelectTool, { effect_number: 12 });
    snapshotLastMessage(service, oscPayloadAnnotations.effects.select);

    await runTool(eosEffectStopTool, { effect_number: 7 });
    snapshotLastMessage(service, oscPayloadAnnotations.effects.stop);
  });

  it('captures EOS-native show-control command payloads', async () => {
    await runTool(eosSetCueSendStringTool, { format_string: 'Cue %1 -> %2 (%3)' });
    snapshotLastMessage(service, oscPayloadAnnotations.showControl.setCueSendString);

    await runTool(eosSetCueReceiveStringTool, { format_string: 'Receive %1 [%2]' });
    snapshotLastMessage(service, oscPayloadAnnotations.showControl.setCueReceiveString);
  });

  it('captures EOS-native control surface payloads', async () => {
    await runTool(eosKeyPressTool, { key_name: 'go' });
    snapshotLastMessage(service, oscPayloadAnnotations.keys.press);

    await runTool(eosGroupSetLevelTool, { group_number: 5, level: 75 });
    snapshotLastMessage(service, oscPayloadAnnotations.groups.level);
  });

  it('captures EOS-native layout payloads', async () => {
    await runTool(eosFaderBankCreateTool, { bank_index: 1, fader_count: 10 });
    snapshotLastMessage(service, oscPayloadAnnotations.faders.bankCreate);

    await runTool(eosDirectSelectBankCreateTool, {
      bank_index: 1,
      target_type: 'chan',
      button_count: 10,
      flexi_mode: false,
      page_number: 1
    });
    snapshotLastMessage(service, oscPayloadAnnotations.directSelects.bankCreate);
  });

  it('captures cue/magic sheet EOS-native payloads', async () => {
    await runTool(eosCueFireTool, { cue_number: 1, cuelist_number: 2, require_confirmation: true });
    snapshotLastMessage(service, oscPayloadAnnotations.cues.fire);

    await runTool(eosMagicSheetOpenTool, { ms_number: 3 });
    snapshotLastMessage(service, oscPayloadAnnotations.magicSheets.open);
  });
});
