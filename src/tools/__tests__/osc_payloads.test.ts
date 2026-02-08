import type { OscMessage } from '../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../services/osc/client';
import { eosCommandTool, eosNewCommandTool } from '../commands/command_tools';
import { eosChannelSetParameterTool } from '../channels/index';
import { eosAddressSetDmxTool } from '../dmx/index';
import { eosGroupSetLevelTool } from '../groups/index';
import { eosKeyPressTool } from '../keys/index';
import { eosFaderBankCreateTool } from '../faders/index';
import { eosDirectSelectBankCreateTool } from '../directSelects/index';
import { eosMagicSheetOpenTool } from '../magicSheets/index';
import { eosCueFireTool } from '../cues/fire';
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

function snapshotLastMessage(service: FakeOscService): void {
  const message = service.sentMessages[service.sentMessages.length - 1];
  expect({ address: message.address, args: message.args ?? [] }).toMatchSnapshot();
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

  it('captures command line payloads', async () => {
    await runTool(eosCommandTool, {
      command: 'Chan 1 At 50',
      terminateWithEnter: true,
      safety_level: 'standard'
    });
    snapshotLastMessage(service);

    await runTool(eosNewCommandTool, {
      command: 'Cue 1 Record',
      terminateWithEnter: true,
      require_confirmation: true
    });
    snapshotLastMessage(service);
  });

  it('captures JSON parameter payloads', async () => {
    await runTool(eosChannelSetParameterTool, { channels: [1, 2], parameter: 'pan', value: 45 });
    snapshotLastMessage(service);

    await runTool(eosAddressSetDmxTool, { address_number: '1/101', dmx_value: 255 });
    snapshotLastMessage(service);
  });

  it('captures control surface payloads', async () => {
    await runTool(eosKeyPressTool, { key_name: 'go' });
    snapshotLastMessage(service);

    await runTool(eosGroupSetLevelTool, { group_number: 5, level: 75 });
    snapshotLastMessage(service);
  });

  it('captures layout payloads', async () => {
    await runTool(eosFaderBankCreateTool, { bank_index: 1, fader_count: 10 });
    snapshotLastMessage(service);

    await runTool(eosDirectSelectBankCreateTool, {
      bank_index: 1,
      target_type: 'chan',
      button_count: 10,
      flexi_mode: false,
      page_number: 1
    });
    snapshotLastMessage(service);
  });

  it('captures cue/magic sheet payloads', async () => {
    await runTool(eosCueFireTool, { cue_number: 1, cuelist_number: 2, require_confirmation: true });
    snapshotLastMessage(service);

    await runTool(eosMagicSheetOpenTool, { ms_number: 3 });
    snapshotLastMessage(service);
  });
});
