import type { OscMessage } from '../../../services/osc/index';
import { OscClient, setOscClient, type OscGateway } from '../../../services/osc/client';
import { oscMappings } from '../../../services/osc/mappings';
import {
  eosSubmasterSetLevelTool,
  eosSubmasterBumpTool,
  eosSubmasterGetInfoTool
} from '../index';

class FakeOscService implements OscGateway {
  public readonly sentMessages: OscMessage[] = [];

  private readonly listeners = new Set<(message: OscMessage) => void>();

  public send(message: OscMessage): void {
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

const runTool = async (tool: any, args: unknown): Promise<any> => {
  const handler = tool.handler as unknown as (input: unknown, extra?: unknown) => Promise<any>;
  return handler(args, {});
};

describe('submaster tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
  });

  afterEach(() => {
    setOscClient(null);
  });

  it('envoie le niveau normalise en float pour un submaster', async () => {
    await runTool(eosSubmasterSetLevelTool, { submaster_number: 7, level: '75%' });

    expect(service.sentMessages).toHaveLength(1);
    expect(service.sentMessages[0]).toMatchObject({ address: `${oscMappings.submasters.base}/7` });
    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'f', value: 0.75 });
  });

  it('convertit la commande de bump en indicateur booleen', async () => {
    await runTool(eosSubmasterBumpTool, { submaster_number: 5, state: 'on' });
    await runTool(eosSubmasterBumpTool, { submaster_number: 5, state: 0 });

    expect(service.sentMessages).toHaveLength(2);

    expect(service.sentMessages[0]).toMatchObject({ address: `${oscMappings.submasters.base}/5/bump` });
    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'f', value: 1 });

    expect(service.sentMessages[1]).toMatchObject({ address: `${oscMappings.submasters.base}/5/bump` });
    expect(service.sentMessages[1]?.args?.[0]).toMatchObject({ type: 'f', value: 0 });
  });

  it('normalise les informations et timings du submaster', async () => {
    const promise = runTool(eosSubmasterGetInfoTool, { submaster_number: 12 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.submasters.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              submaster: {
                number: '12',
                label: 'Front Wash',
                mode: 'intensity',
                fader_mode: 'proportional',
                priority: '10',
                flags: {
                  htp: 'yes',
                  exclusive: 0,
                  background_enable: '1',
                  restore: 'false'
                },
                timings: {
                  up_time: '3.5',
                  down_time: 4,
                  assert_time: '1.2',
                  release_time: '0'
                }
              }
            })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    expect(objectContent.data).toMatchObject({
      action: 'submaster_get_info',
      status: 'ok',
      submaster: {
        submasterNumber: 12,
        label: 'Front Wash',
        mode: 'intensity',
        faderMode: 'proportional',
        htp: true,
        exclusive: false,
        background: true,
        restore: false,
        priority: 10,
        timings: {
          up: 3.5,
          down: 4,
          assert: 1.2,
          release: 0
        }
      }
    });
  });

  it('interprete les variations HTP/exclusive depuis differentes sources', async () => {
    const promise = runTool(eosSubmasterGetInfoTool, { submaster_number: 4 });

    queueMicrotask(() => {
      service.emit({
        address: oscMappings.submasters.info,
        args: [
          {
            type: 's',
            value: JSON.stringify({
              status: 'ok',
              submaster: {
                id: 4,
                label: 'Side Light',
                htp: 0,
                exclusive: 1,
                flags: {
                  htp: 'on',
                  exclusive: 0
                }
              }
            })
          }
        ]
      });
    });

    const result = await promise;
    const objectContent = (result.content as any[])?.find((item) => item.type === 'object');
    expect(objectContent).toBeDefined();

    expect(objectContent.data.submaster).toMatchObject({
      submasterNumber: 4,
      label: 'Side Light',
      htp: false,
      exclusive: true
    });
  });
});
