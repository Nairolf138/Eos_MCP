/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../index';

describe('ResourceCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const cache = getResourceCache();
    cache.clearAll();
    cache.setDefaultTtl(1500);
  });

  afterEach(() => {
    const cache = getResourceCache();
    cache.clearAll();
    cache.setDefaultTtl(1500);
    cache.setResourceTtl('groups', null);
    cache.setResourceTtl('cues', null);
    cache.setResourceTtl('fixtures', null);
    jest.useRealTimers();
  });

  it('cache les valeurs et met a jour les statistiques hits/misses', async () => {
    const cache = getResourceCache();
    const fetcher = jest.fn(async () => 'value');
    const key = createCacheKey({ address: '/test', payload: {} });

    const first = await cache.fetch({ resourceType: 'groups', key, fetcher });
    const second = await cache.fetch({ resourceType: 'groups', key, fetcher });

    expect(first).toBe('value');
    expect(second).toBe('value');
    expect(fetcher).toHaveBeenCalledTimes(1);

    const stats = cache.getStats('groups');
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.entries).toBe(1);
  });

  it('expire les entrees apres la duree TTL configuree', async () => {
    const cache = getResourceCache();
    cache.setResourceTtl('groups', 100);
    const key = createCacheKey({ address: '/ttl', payload: {} });
    const fetcher = jest.fn(async () => Date.now());

    const initial = await cache.fetch({ resourceType: 'groups', key, fetcher });
    jest.advanceTimersByTime(200);
    const refreshed = await cache.fetch({ resourceType: 'groups', key, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toBe(initial);
    const stats = cache.getStats('groups');
    expect(stats.misses).toBe(2);
    expect(stats.hits).toBe(0);
  });

  it('invalide les entrees lors de la reception de messages OSC avec prefixe', async () => {
    const cache = getResourceCache();
    const key = createCacheKey({ address: '/resource', payload: {} });
    const fetcher = jest.fn(async () => 'initial');

    await cache.fetch({
      resourceType: 'groups',
      key,
      fetcher,
      prefixTags: [createOscPrefixTag('/eos/out/group')]
    });

    await cache.fetch({
      resourceType: 'groups',
      key,
      fetcher,
      prefixTags: [createOscPrefixTag('/eos/out/group')]
    });

    cache.handleOscMessage({ address: '/eos/out/group/1', args: [] });

    const newFetcher = jest.fn(async () => 'after');
    const value = await cache.fetch({
      resourceType: 'groups',
      key,
      fetcher: newFetcher,
      prefixTags: [createOscPrefixTag('/eos/out/group')]
    });

    expect(newFetcher).toHaveBeenCalledTimes(1);
    expect(value).toBe('after');

    const stats = cache.getStats('groups');
    expect(stats.misses).toBe(2);
    expect(stats.hits).toBe(1);
  });



  it('applique une configuration TTL par famille critique', async () => {
    const cache = getResourceCache();
    cache.configureTtls(1000, { cues: 50, fixtures: 5000 });
    const key = createCacheKey({ address: '/cue', payload: {} });
    const fetcher = jest.fn(async () => Date.now());

    const initial = await cache.fetch({ resourceType: 'cues', key, fetcher });
    jest.advanceTimersByTime(60);
    const refreshed = await cache.fetch({ resourceType: 'cues', key, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toBe(initial);
  });

  it('expose un instantane des statistiques par ressource avec totaux', async () => {
    const cache = getResourceCache();
    const groupKey = createCacheKey({ address: '/group', payload: {} });
    const fixtureKey = createCacheKey({ address: '/fixture', payload: { q: 'spot' } });

    await cache.fetch({ resourceType: 'groups', key: groupKey, fetcher: async () => 'group' });
    await cache.fetch({ resourceType: 'groups', key: groupKey, fetcher: async () => 'group' });
    await cache.fetch({ resourceType: 'fixtures', key: fixtureKey, fetcher: async () => ['fixture'] });

    const snapshot = cache.getStatsSnapshot();

    expect(snapshot.resources.groups).toEqual({ hits: 1, misses: 1, entries: 1 });
    expect(snapshot.resources.fixtures).toEqual({ hits: 0, misses: 1, entries: 1 });
    expect(snapshot.totals).toMatchObject({ hits: 1, misses: 2 });
    expect(snapshot.totals.entries).toBeGreaterThanOrEqual(2);
  });

  it('notifie les changements de ressource et invalide les entrees concernees', async () => {
    const cache = getResourceCache();
    const key = createCacheKey({ address: '/resource', payload: { id: 5 } });
    const fetcher = jest.fn(async () => 'snapshot');

    await cache.fetch({
      resourceType: 'groups',
      key,
      fetcher,
      tags: [
        createResourceTag('groups'),
        createResourceTag('groups', '5')
      ]
    });

    cache.notifyResourceChange('groups', '5');

    const newFetcher = jest.fn(async () => 'updated');
    const value = await cache.fetch({
      resourceType: 'groups',
      key,
      fetcher: newFetcher,
      tags: [
        createResourceTag('groups'),
        createResourceTag('groups', '5')
      ]
    });

    expect(newFetcher).toHaveBeenCalledTimes(1);
    expect(value).toBe('updated');
  });
});
