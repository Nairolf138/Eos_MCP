import type { OscMessage } from '../osc/index';

export type ResourceType =
  | 'channels'
  | 'patch'
  | 'groups'
  | 'palettes'
  | 'presets'
  | 'macros'
  | 'snapshots'
  | 'curves'
  | 'effects'
  | 'pixelMaps'
  | 'magicSheets'
  | 'submasters'
  | 'cues'
  | 'cuelists'
  | 'queries'
  | 'session';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
  prefixTags: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
}

export interface FetchOptions<T> {
  resourceType: ResourceType;
  key: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
  tags?: string[];
  prefixTags?: string[];
}

export interface CacheStatsSnapshot extends CacheStats {
  entries: number;
}

interface CacheKeyParts {
  address: string;
  payload?: Record<string, unknown>;
  targetAddress?: string;
  targetPort?: number;
  extra?: unknown;
}

type EntryId = string;

type ResourceCacheMap = Map<string, CacheEntry<unknown>>;

function sanitise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitise(item));
  }

  if (value && typeof value === 'object') {
    const entries: Array<[string, unknown]> = Object.entries(
      value as Record<string, unknown>
    )
      .filter(([, v]) => typeof v !== 'undefined')
      .map(([key, val]) => [key, sanitise(val)]);

    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = val;
    }
    return result;
  }

  return value;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(',')}}`;
}

function getEntryId(resourceType: ResourceType, key: string): EntryId {
  return `${resourceType}::${key}`;
}

function parseEntryId(entryId: EntryId): { resourceType: ResourceType; key: string } {
  const [resourceType, key] = entryId.split('::');
  return { resourceType: resourceType as ResourceType, key };
}

function extractPrefixKey(prefixTag: string): string {
  return prefixTag.startsWith('osc-prefix:') ? prefixTag.slice('osc-prefix:'.length) : prefixTag;
}

export function createCacheKey(parts: CacheKeyParts): string {
  const payload = sanitise(parts.payload ?? {});
  const extra = typeof parts.extra === 'undefined' ? null : sanitise(parts.extra);
  const segments = [
    parts.address,
    parts.targetAddress ?? 'default',
    typeof parts.targetPort === 'number' ? String(parts.targetPort) : 'default',
    stableStringify(payload),
    stableStringify(extra)
  ];
  return segments.join('|');
}

export function createOscAddressTag(address: string): string {
  return `osc:${address}`;
}

export function createOscPrefixTag(prefix: string): string {
  return `osc-prefix:${prefix}`;
}

export function createResourceTag(resourceType: ResourceType, key?: string): string {
  return typeof key === 'string' ? `resource:${resourceType}:${key}` : `resource:${resourceType}`;
}

class ResourceCache {
  private readonly caches = new Map<ResourceType, ResourceCacheMap>();

  private readonly stats = new Map<ResourceType, CacheStats>();

  private readonly tagIndex = new Map<string, Set<EntryId>>();

  private readonly prefixIndex = new Map<string, Set<EntryId>>();

  private defaultTtlMs = 1500;

  private readonly resourceTtls = new Map<ResourceType, number>();

  public async fetch<T>({
    resourceType,
    key,
    fetcher,
    ttlMs,
    tags = [],
    prefixTags = []
  }: FetchOptions<T>): Promise<T> {
    const cache = this.getCache(resourceType);
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      this.incrementHit(resourceType);
      return entry.value;
    }

    if (entry) {
      this.removeEntry(resourceType, key);
    }

    this.incrementMiss(resourceType);

    const value = await fetcher();
    const ttl = ttlMs ?? this.resourceTtls.get(resourceType) ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? now + ttl : now;
    const newEntry: CacheEntry<T> = {
      value,
      expiresAt,
      tags: [...tags],
      prefixTags: [...prefixTags]
    };

    cache.set(key, newEntry);
    this.registerEntry(resourceType, key, newEntry);

    return value;
  }

  public invalidateResourceType(resourceType: ResourceType): void {
    const cache = this.caches.get(resourceType);
    if (!cache) {
      return;
    }

    for (const key of Array.from(cache.keys())) {
      this.removeEntry(resourceType, key);
    }
  }

  public invalidateEntry(resourceType: ResourceType, key: string): void {
    this.removeEntry(resourceType, key);
  }

  public invalidateByTag(tag: string): void {
    const refs = this.tagIndex.get(tag);
    if (!refs || refs.size === 0) {
      return;
    }

    for (const entryId of Array.from(refs)) {
      const { resourceType, key } = parseEntryId(entryId);
      this.removeEntry(resourceType, key);
    }
  }

  public invalidateByPrefix(prefixTag: string): void {
    const refs = this.prefixIndex.get(prefixTag);
    if (!refs || refs.size === 0) {
      return;
    }

    for (const entryId of Array.from(refs)) {
      const { resourceType, key } = parseEntryId(entryId);
      this.removeEntry(resourceType, key);
    }
  }

  public invalidateByOscAddress(address: string): void {
    this.invalidateByTag(createOscAddressTag(address));

    for (const prefixTag of Array.from(this.prefixIndex.keys())) {
      const prefix = extractPrefixKey(prefixTag);
      if (address.startsWith(prefix)) {
        this.invalidateByPrefix(prefixTag);
      }
    }
  }

  public notifyResourceChange(resourceType: ResourceType, key?: string): void {
    this.invalidateByTag(createResourceTag(resourceType));
    if (typeof key === 'string') {
      this.invalidateByTag(createResourceTag(resourceType, key));
    }
  }

  public handleOscMessage(message: OscMessage): void {
    if (message.address.startsWith('/eos/out/')) {
      this.invalidateByOscAddress(message.address);
    }
  }

  public clearAll(): void {
    for (const resourceType of Array.from(this.caches.keys())) {
      this.invalidateResourceType(resourceType);
    }
    this.stats.clear();
  }

  public setDefaultTtl(ttlMs: number): void {
    this.defaultTtlMs = Math.max(0, ttlMs);
  }

  public setResourceTtl(resourceType: ResourceType, ttlMs: number | null): void {
    if (ttlMs === null) {
      this.resourceTtls.delete(resourceType);
      return;
    }
    this.resourceTtls.set(resourceType, Math.max(0, ttlMs));
  }

  public getStats(resourceType: ResourceType): CacheStatsSnapshot {
    const cache = this.caches.get(resourceType);
    const stats = this.stats.get(resourceType) ?? { hits: 0, misses: 0 };
    return {
      hits: stats.hits,
      misses: stats.misses,
      entries: cache?.size ?? 0
    };
  }

  private getCache(resourceType: ResourceType): ResourceCacheMap {
    let cache = this.caches.get(resourceType);
    if (!cache) {
      cache = new Map();
      this.caches.set(resourceType, cache);
    }
    return cache;
  }

  private incrementHit(resourceType: ResourceType): void {
    const stats = this.stats.get(resourceType) ?? { hits: 0, misses: 0 };
    stats.hits += 1;
    this.stats.set(resourceType, stats);
  }

  private incrementMiss(resourceType: ResourceType): void {
    const stats = this.stats.get(resourceType) ?? { hits: 0, misses: 0 };
    stats.misses += 1;
    this.stats.set(resourceType, stats);
  }

  private registerEntry(resourceType: ResourceType, key: string, entry: CacheEntry<unknown>): void {
    const entryId = getEntryId(resourceType, key);

    entry.tags.forEach((tag) => {
      const bucket = this.tagIndex.get(tag) ?? new Set<EntryId>();
      bucket.add(entryId);
      this.tagIndex.set(tag, bucket);
    });

    entry.prefixTags.forEach((prefixTag) => {
      const bucket = this.prefixIndex.get(prefixTag) ?? new Set<EntryId>();
      bucket.add(entryId);
      this.prefixIndex.set(prefixTag, bucket);
    });
  }

  private removeEntry(resourceType: ResourceType, key: string): void {
    const cache = this.caches.get(resourceType);
    if (!cache) {
      return;
    }

    const entry = cache.get(key);
    if (!entry) {
      return;
    }

    cache.delete(key);
    const entryId = getEntryId(resourceType, key);

    entry.tags.forEach((tag) => {
      const bucket = this.tagIndex.get(tag);
      if (!bucket) {
        return;
      }
      bucket.delete(entryId);
      if (bucket.size === 0) {
        this.tagIndex.delete(tag);
      }
    });

    entry.prefixTags.forEach((prefixTag) => {
      const bucket = this.prefixIndex.get(prefixTag);
      if (!bucket) {
        return;
      }
      bucket.delete(entryId);
      if (bucket.size === 0) {
        this.prefixIndex.delete(prefixTag);
      }
    });
  }
}

const sharedCache = new ResourceCache();

export function getResourceCache(): ResourceCache {
  return sharedCache;
}
