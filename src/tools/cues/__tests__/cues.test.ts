import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosCueGoTool,
  eosCueStopBackTool,
  eosCuelistBankCreateTool,
  eosCuelistBankPageTool,
  eosGetActiveCueTool
} from '../index';
import { isObjectContent, runTool } from '../../__tests__/helpers/runTool';

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

describe('cue tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('enchaine un go puis un stop back sur la meme liste', async () => {
    await runTool(eosCueGoTool, { cuelist_number: 5 });
    await runTool(eosCueStopBackTool, { cuelist_number: 5, back: true });

    expect(service.sentMessages).toHaveLength(2);

    const goMessage = service.sentMessages[0];
    expect(goMessage.address).toBe(oscMappings.cues.go);
    const goPayload = JSON.parse(String(goMessage?.args?.[0]?.value ?? '{}'));
    expect(goPayload).toMatchObject({ cuelist: 5 });

    const stopMessage = service.sentMessages[1];
    expect(stopMessage.address).toBe(oscMappings.cues.stopBack);
    expect(stopMessage.args?.[0]).toMatchObject({ type: 's', value: 'Cue 5 Back#' });
  });

  it('normalise les donnees renvoyees par get_active_cue', async () => {
    const promise = runTool(eosGetActiveCueTool, { cuelist_number: 1 });

    queueMicrotask(() => {
      const payload = {
        status: 'ok',
        cue: {
          cuelist: 1,
          cue: '2',
          cue_part: 1,
          label: 'Transition',
          timings: {
            up: '5.0',
            down: '10.0',
            focus: '2.5'
          },
          flags: {
            mark: 1,
            block: 0,
            assert: true,
            solo: 'false',
            timecode: 'yes'
          },
          link: '2.5',
          follow: '3.5',
          hang: '00:02',
          loop: 0,
          notes: 'Example'
        },
        duration: '45',
        progress: '50%',
        remaining: '00:30'
      };

      service.emit({
        address: oscMappings.cues.active,
        args: [
          {
            type: 's',
            value: JSON.stringify(payload)
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = result.content.find(isObjectContent);
    expect(objectContent).toBeDefined();
    if (!objectContent) {
      throw new Error('Expected object content');
    }

    expect(objectContent.data).toMatchObject({
      cue: {
        details: {
          identifier: {
            cuelistNumber: 1,
            cueNumber: '2',
            cuePart: 1
          },
          timings: {
            up: 5,
            down: 10,
            focus: 2.5
          },
          flags: {
            mark: true,
            block: false,
            assert: true,
            solo: false,
            timecode: true
          },
          links: {
            link: '2.5',
            follow: 3.5,
            hang: 2,
            loop: 0
          },
          notes: 'Example'
        },
        durationSeconds: 45,
        progressPercent: 50,
        remainingSeconds: 30
      }
    });
  });

  it('configure un bank de cuelist via des chemins parametres', async () => {
    const result = await runTool(eosCuelistBankCreateTool, {
      bank_index: 2,
      cuelist_number: 7,
      num_prev_cues: 3,
      num_pending_cues: 4,
      offset: 5
    });

    expect(service.sentMessages).toHaveLength(4);
    const addresses = service.sentMessages.map((message) => message.address);
    expect(addresses).toEqual([
      '/eos/cuelist/2/config/list',
      '/eos/cuelist/2/config/previous',
      '/eos/cuelist/2/config/pending',
      '/eos/cuelist/2/config/offset'
    ]);

    expect(service.sentMessages[0]?.args).toEqual([{ type: 'i', value: 7 }]);
    expect(service.sentMessages[1]?.args).toEqual([{ type: 'i', value: 3 }]);
    expect(service.sentMessages[2]?.args).toEqual([{ type: 'i', value: 4 }]);
    expect(service.sentMessages[3]?.args).toEqual([{ type: 'i', value: 5 }]);

    const objectContent = result.content.find(isObjectContent);
    expect(objectContent).toBeDefined();
    if (!objectContent) {
      throw new Error('Expected object content');
    }

    expect(objectContent.data).toMatchObject({
      action: 'cuelist_bank_create',
      osc: {
        messages: [
          { address: '/eos/cuelist/2/config/list' },
          { address: '/eos/cuelist/2/config/previous' },
          { address: '/eos/cuelist/2/config/pending' },
          { address: '/eos/cuelist/2/config/offset' }
        ]
      }
    });
  });

  it('navigue dans un bank de cuelist avec un delta signe', async () => {
    const result = await runTool(eosCuelistBankPageTool, { bank_index: 3, delta: -2 });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe('/eos/cuelist/3/page/-2');
    expect(message.args ?? []).toEqual([]);

    const objectContent = result.content.find(isObjectContent);
    expect(objectContent).toBeDefined();
    if (!objectContent) {
      throw new Error('Expected object content');
    }

    expect(objectContent.data).toMatchObject({
      action: 'cuelist_bank_page',
      osc: {
        address: '/eos/cuelist/3/page/-2'
      }
    });
  });
});
