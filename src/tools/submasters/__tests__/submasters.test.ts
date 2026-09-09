/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { oscMappings } from '../../../services/osc/mappings';
import { runTool } from '../../__tests__/helpers/runTool';
import {
    eosSubmasterBumpTool,
    eosSubmasterSetLevelTool
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

  it.each([[0.5,0.5],['0.5%',0.005],[37.5,0.375],['37.5%',0.375]])('preserve les unites submaster de %s', async (level,value)=>{
    await runTool(eosSubmasterSetLevelTool,{submaster_number:7,level});
    expect(service.sentMessages).toEqual([{address:'/eos/sub/7',args:[{type:'f',value}]}]);
  });

  it('convertit la commande de bump en indicateur booleen', async () => {
    await runTool(eosSubmasterBumpTool, { submaster_number: 5, state: 'on' });
    await runTool(eosSubmasterBumpTool, { submaster_number: 5, state: 0 });

    expect(service.sentMessages).toHaveLength(2);

    expect(service.sentMessages[0]).toMatchObject({ address: `${oscMappings.submasters.base}/5/fire` });
    expect(service.sentMessages[0]?.args?.[0]).toMatchObject({ type: 'f', value: 1 });

    expect(service.sentMessages[1]).toMatchObject({ address: `${oscMappings.submasters.base}/5/fire` });
    expect(service.sentMessages[1]?.args?.[0]).toMatchObject({ type: 'f', value: 0 });
  });
});
