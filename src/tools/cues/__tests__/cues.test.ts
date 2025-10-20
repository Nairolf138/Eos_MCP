import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosCueGoTool,
  eosCueStopBackTool,
  eosGetActiveCueTool
} from '../index';

type ToolHandler = (args: unknown, extra?: unknown) => Promise<any>;

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

  const runTool = async (tool: any, args: unknown): Promise<any> => {
    const handler = tool.handler as ToolHandler;
    return handler(args, {});
  };

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
    const stopPayload = JSON.parse(String(stopMessage?.args?.[0]?.value ?? '{}'));
    expect(stopPayload).toMatchObject({ cuelist: 5, back: true });
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
    const objectContent = (result.content as any[]).find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    const cueState = objectContent.data.cue;
    expect(cueState.details.identifier).toEqual({
      cuelistNumber: 1,
      cueNumber: '2',
      cuePart: 1
    });
    expect(cueState.details.timings).toMatchObject({
      up: 5,
      down: 10,
      focus: 2.5
    });
    expect(cueState.details.flags).toMatchObject({
      mark: true,
      block: false,
      assert: true,
      solo: false,
      timecode: true
    });
    expect(cueState.details.links).toMatchObject({
      link: '2.5',
      follow: 3.5,
      hang: 2,
      loop: 0
    });
    expect(cueState.details.notes).toBe('Example');
    expect(cueState.durationSeconds).toBe(45);
    expect(cueState.progressPercent).toBe(50);
    expect(cueState.remainingSeconds).toBe(30);
  });
});
