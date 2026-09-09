/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { createCacheKey, createResourceTag, getResourceCache } from '../../../services/cache/index';
import { OscClient, setOscClient, type OscGateway, type OscGatewaySendOptions } from '../../../services/osc/client';
import type { OscMessage } from '../../../services/osc/index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';
import {
    eosCueFireTool,
    eosCueGoTool,
    eosCueSelectTool,
    eosCueStopBackTool,
    eosCuelistBankCreateTool,
    eosCuelistBankPageTool
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

describe('cue tools', () => {
  let service: FakeOscService;

  beforeEach(() => {
    service = new FakeOscService();
    const client = new OscClient(service, { defaultTimeoutMs: 50 });
    setOscClient(client);
    getResourceCache().clearAll();
  });

  afterEach(() => {
    setOscClient(null);
    getResourceCache().clearAll();
  });


  it('bloque cue_fire sans confirmation explicite', async () => {
    await expect(runTool(eosCueFireTool, { cuelist_number: 1, cue_number: 10 })).rejects.toThrow('Action sensible bloquee');
    expect(service.sentMessages).toHaveLength(0);
  });

  it('retourne la commande cue_fire calculee en dry_run', async () => {
    const result = await runTool(eosCueFireTool, { cuelist_number: 1, cue_number: 10, dry_run: true });
    expect(service.sentMessages).toHaveLength(0);
    expect(getStructuredContent(result)).toMatchObject({
      action: 'cue_fire',
      dry_run: true,
      osc: { address: '/eos/cue/1/10/fire' }
    });
  });


  it.each([
    [{cue_number:12.5}, '/eos/cue/12.5/fire'],
    [{cue_number:12.5,cuelist_number:2}, '/eos/cue/2/12.5/fire'],
    [{cue_number:12.5,cuelist_number:2,cue_part:0}, '/eos/cue/2/12.5/0/fire'],
    [{cue_number:12.5,cuelist_number:2,cue_part:3}, '/eos/cue/2/12.5/3/fire']
  ])('preserve exactement la cible cue %j', async (args, address) => {
    await runTool(eosCueFireTool, {...args, confirm:true});
    expect(service.sentMessages).toEqual([{address}]);
  });

  it('refuse une part sans liste et une option back qui promettrait une autre action', async () => {
    await expect(runTool(eosCueFireTool, {cue_number:12.5,cue_part:2,confirm:true})).rejects.toThrow('liste');
    await expect(runTool(eosCueStopBackTool, {cuelist_number:2,back:true})).rejects.toThrow();
    expect(service.sentMessages).toHaveLength(0);
  });

  it('refuse cue_part sans cue_number sur cue_go', async () => {
    await expect(runTool(eosCueGoTool, { cuelist_number: 5, cue_part: 1 })).rejects.toThrow('cue_part requiert cue_number');
  });

  it('enchaine un go puis un stop back sur la meme liste', async () => {
    await runTool(eosCueGoTool, { cuelist_number: 5 });
    await runTool(eosCueStopBackTool, { cuelist_number: 5 });

    expect(service.sentMessages).toHaveLength(2);

    const goMessage = service.sentMessages[0];
    expect(goMessage.address).toBe('/eos/cues/5/fire');
    expect(goMessage.args).toBeUndefined();

    const stopMessage = service.sentMessages[1];
    expect(stopMessage.address).toBe('/eos/cues/5/stop');
    expect(stopMessage.args ?? []).toEqual([]);
  });



  it('conserve le GO natif meme en mode compatibilite', async () => {
    await runTool(eosCueGoTool, { cuelist_number: 5 }, { cueOscMode: 'compatibility' });

    expect(service.sentMessages).toEqual([
      {
        address: '/eos/cues/5/fire'
      }
    ]);
  });

  it('selectionne une cue sans cuelist via adresse native officielle', async () => {
    await runTool(eosCueSelectTool, { cue_number: 7 });

    expect(service.sentMessages).toEqual([
      {
        address: '/eos/cue', args: [{ type: 'i', value: 7 }]
      }
    ]);
  });
  it('invalide les caches cues et cuelists apres une commande GO', async () => {
    const cache = getResourceCache();
    const cueKey = createCacheKey({ address: '/cue/info', payload: { cue: 2 } });
    const listKey = createCacheKey({ address: '/cue/list', payload: { cuelist: 5 } });

    await cache.fetch({
      resourceType: 'cues',
      key: cueKey,
      tags: [createResourceTag('cues'), createResourceTag('cues', '5:2:0')],
      fetcher: async () => 'cue-before'
    });
    await cache.fetch({
      resourceType: 'cuelists',
      key: listKey,
      tags: [createResourceTag('cuelists'), createResourceTag('cuelists', '5')],
      fetcher: async () => 'list-before'
    });

    await runTool(eosCueGoTool, { cuelist_number: 5, cue_number: 2 });

    const cueFetcher = jest.fn(async () => 'cue-after');
    const listFetcher = jest.fn(async () => 'list-after');
    await cache.fetch({
      resourceType: 'cues',
      key: cueKey,
      tags: [createResourceTag('cues'), createResourceTag('cues', '5:2:0')],
      fetcher: cueFetcher
    });
    await cache.fetch({
      resourceType: 'cuelists',
      key: listKey,
      tags: [createResourceTag('cuelists'), createResourceTag('cuelists', '5')],
      fetcher: listFetcher
    });

    expect(cueFetcher).toHaveBeenCalledTimes(1);
    expect(listFetcher).toHaveBeenCalledTimes(1);
  });

  it('configure un bank de cuelist via un chemin parametre', async () => {
    await runTool(eosCuelistBankCreateTool, {
      bank_index: 3,
      cuelist_number: 99,
      num_prev_cues: 2,
      num_pending_cues: 4,
      offset: 7
    });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe('/eos/cuelist/3/config/99/2/4/7');
    expect(message.args ?? []).toEqual([]);
  });

  it('navigue dans un bank de cuelist via un chemin parametre', async () => {
    await runTool(eosCuelistBankPageTool, {
      bank_index: 5,
      delta: -2
    });

    expect(service.sentMessages).toHaveLength(1);
    const message = service.sentMessages[0];
    expect(message.address).toBe('/eos/cuelist/5/page/-2');
    expect(message.args ?? []).toEqual([]);
  });
});
