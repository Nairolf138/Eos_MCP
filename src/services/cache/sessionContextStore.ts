/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export type SessionContextPersistenceMode = 'memory' | 'file' | 'external';

interface StoredSessionContextEntry<T> {
  value: T;
  expiresAt: number;
  updatedAt: number;
}

export interface ExternalSessionContextStore<T = unknown> {
  get(key: string): Promise<StoredSessionContextEntry<T> | null>;
  set(key: string, entry: StoredSessionContextEntry<T>): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys?: () => Promise<string[]>;
}

export interface SessionContextPersistenceConfig<T = unknown> {
  mode: SessionContextPersistenceMode;
  filePath?: string;
  externalStore?: ExternalSessionContextStore<T>;
}

const DEFAULT_SESSION_CONTEXT_FILE = join(tmpdir(), 'eos-mcp-session-contexts.json');

function isNodeErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code
  );
}

class MemorySessionContextStore<T> {
  private readonly entries = new Map<string, StoredSessionContextEntry<T>>();

  public async get(key: string): Promise<StoredSessionContextEntry<T> | null> {
    return this.entries.get(key) ?? null;
  }

  public async set(key: string, entry: StoredSessionContextEntry<T>): Promise<void> {
    this.entries.set(key, entry);
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  public async listKeys(): Promise<string[]> {
    return Array.from(this.entries.keys());
  }

  public clear(): void {
    this.entries.clear();
  }
}

class FileSessionContextStore<T> implements ExternalSessionContextStore<T> {
  constructor(private readonly filePath: string = DEFAULT_SESSION_CONTEXT_FILE) {}

  public async get(key: string): Promise<StoredSessionContextEntry<T> | null> {
    const entries = await this.readEntries();
    return entries[key] ?? null;
  }

  public async set(key: string, entry: StoredSessionContextEntry<T>): Promise<void> {
    const entries = await this.readEntries();
    entries[key] = entry;
    await this.writeEntries(entries);
  }

  public async delete(key: string): Promise<void> {
    const entries = await this.readEntries();
    delete entries[key];
    await this.writeEntries(entries);
  }

  public async listKeys(): Promise<string[]> {
    return Object.keys(await this.readEntries());
  }

  private async readEntries(): Promise<Record<string, StoredSessionContextEntry<T>>> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, StoredSessionContextEntry<T>>;
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        return {};
      }
      throw error;
    }
  }

  private async writeEntries(entries: Record<string, StoredSessionContextEntry<T>>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const payload = JSON.stringify(entries, null, 2);
    await writeFile(tempPath, payload, 'utf8');
    await rename(tempPath, this.filePath);
  }

  public async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if (!isNodeErrorCode(error, 'ENOENT')) {
        throw error;
      }
    }
  }
}

class SessionContextStore<T> {
  private readonly memoryStore = new MemorySessionContextStore<T>();

  private mode: SessionContextPersistenceMode = 'memory';

  private fileStore: FileSessionContextStore<T> = new FileSessionContextStore<T>();

  private externalStore: ExternalSessionContextStore<T> | null = null;

  public configure(config: SessionContextPersistenceConfig<T>): void {
    this.mode = config.mode;
    if (config.mode === 'file') {
      this.fileStore = new FileSessionContextStore<T>(config.filePath);
    }
    if (config.mode === 'external') {
      if (!config.externalStore) {
        throw new Error('Un stockage externe doit etre fourni pour la persistance session externe.');
      }
      this.externalStore = config.externalStore;
    }
  }

  public getPersistenceMode(): SessionContextPersistenceMode {
    return this.mode;
  }

  public async set(key: string, value: T, ttlMs: number): Promise<StoredSessionContextEntry<T>> {
    const now = Date.now();
    const entry = {
      value,
      expiresAt: now + Math.max(1, ttlMs),
      updatedAt: now
    } satisfies StoredSessionContextEntry<T>;
    await this.activeStore().set(key, entry);
    return entry;
  }

  public async get(key: string): Promise<StoredSessionContextEntry<T> | null> {
    const entry = await this.activeStore().get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      await this.delete(key);
      return null;
    }
    return entry;
  }

  public async delete(key: string): Promise<void> {
    await this.activeStore().delete(key);
  }

  public async cleanupExpired(): Promise<number> {
    const store = this.activeStore();
    if (!store.listKeys) {
      return 0;
    }

    const now = Date.now();
    let deleted = 0;
    for (const key of await store.listKeys()) {
      const entry = await store.get(key);
      if (entry && entry.expiresAt <= now) {
        await store.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  public async clearAll(): Promise<void> {
    const store = this.activeStore();
    if (store.listKeys) {
      await Promise.all((await store.listKeys()).map((key) => store.delete(key)));
      return;
    }
    if (this.mode === 'memory') {
      this.memoryStore.clear();
    }
  }

  private activeStore(): ExternalSessionContextStore<T> {
    if (this.mode === 'file') {
      return this.fileStore;
    }
    if (this.mode === 'external') {
      if (!this.externalStore) {
        throw new Error('Le stockage externe des contextes session nest pas configure.');
      }
      return this.externalStore;
    }
    return this.memoryStore;
  }
}

const sharedSessionContextStore = new SessionContextStore<unknown>();

export function getSessionContextStore(): SessionContextStore<unknown> {
  return sharedSessionContextStore;
}

export const SESSION_CONTEXT_CLEANUP_RULES = {
  defaultTtlMs: 10 * 60 * 1000,
  maxTtlMs: 24 * 60 * 60 * 1000,
  cleanup: 'Les contextes expires sont supprimes a la lecture et par cleanupExpiredSessionContexts().'
} as const;
