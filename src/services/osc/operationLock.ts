/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/** Serializes complete operations, including their verification, on one console. */
export class OperationLock {
  private readonly tails = new Map<string, Promise<void>>();

  public async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const completion = new Promise<void>((resolve) => { release = resolve; });
    this.tails.set(key, completion);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === completion) this.tails.delete(key);
    }
  }
}
