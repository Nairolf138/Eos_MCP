/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { createTimeoutError } from '../../server/errors';

export interface RequestQueueOptions {
  concurrency?: number;
}

export interface RequestQueueRunOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
  details?: Record<string, unknown>;
  targetKey?: string;
  familyKey?: string;
}

export interface RequestQueueTargetDiagnostics {
  targetKey: string;
  pending: number;
  activeCount: number;
  activeFamilies: string[];
}

export interface RequestQueueDiagnostics {
  pending: number;
  activeCount: number;
  concurrency: number;
  targets: RequestQueueTargetDiagnostics[];
}

interface QueueTask<T> {
  readonly operation: string;
  readonly execute: () => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
  readonly options: RequestQueueRunOptions;
  readonly targetKey: string;
  readonly familyKey: string | null;
}

interface TargetQueueState {
  readonly targetKey: string;
  readonly pending: QueueTask<unknown>[];
  readonly activeFamilies: Set<string>;
  activeCount: number;
}

function normaliseConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
}

function normaliseKey(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  return value;
}

export class RequestQueue {
  private readonly concurrency: number;

  private readonly targets = new Map<string, TargetQueueState>();

  private readonly targetOrder: string[] = [];

  constructor(options: RequestQueueOptions = {}) {
    this.concurrency = normaliseConcurrency(options.concurrency);
  }

  public async run<T>(
    operation: string,
    task: () => Promise<T>,
    options: RequestQueueRunOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const targetKey = normaliseKey(options.targetKey, 'default');
      const queueTask: QueueTask<T> = {
        operation,
        execute: task,
        resolve,
        reject,
        options,
        targetKey,
        familyKey: normaliseKey(options.familyKey, '') || null
      };
      this.getTargetState(targetKey).pending.push(queueTask as QueueTask<unknown>);
      this.process();
    });
  }

  public getDiagnostics(): RequestQueueDiagnostics {
    const targets = Array.from(this.targets.values()).map((target) => ({
      targetKey: target.targetKey,
      pending: target.pending.length,
      activeCount: target.activeCount,
      activeFamilies: Array.from(target.activeFamilies).sort()
    }));

    return {
      pending: targets.reduce((total, target) => total + target.pending, 0),
      activeCount: targets.reduce((total, target) => total + target.activeCount, 0),
      concurrency: this.concurrency,
      targets
    };
  }

  private getTargetState(targetKey: string): TargetQueueState {
    const existing = this.targets.get(targetKey);
    if (existing) {
      return existing;
    }

    const created: TargetQueueState = {
      targetKey,
      pending: [],
      activeFamilies: new Set(),
      activeCount: 0
    };
    this.targets.set(targetKey, created);
    this.targetOrder.push(targetKey);
    return created;
  }

  private process(): void {
    let started = false;

    do {
      started = false;
      for (const targetKey of [...this.targetOrder]) {
        const target = this.targets.get(targetKey);
        if (!target || target.activeCount >= this.concurrency) {
          continue;
        }

        const nextIndex = this.findRunnableTaskIndex(target);
        if (nextIndex < 0) {
          this.cleanupTarget(target);
          continue;
        }

        const [next] = target.pending.splice(nextIndex, 1);
        target.activeCount += 1;
        if (next.familyKey) {
          target.activeFamilies.add(next.familyKey);
        }
        started = true;

        void this.execute(next).finally(() => {
          target.activeCount -= 1;
          if (next.familyKey) {
            target.activeFamilies.delete(next.familyKey);
          }
          this.cleanupTarget(target);
          this.process();
        });
      }
    } while (started);
  }

  private findRunnableTaskIndex(target: TargetQueueState): number {
    return target.pending.findIndex((candidate) => (
      !candidate.familyKey || !target.activeFamilies.has(candidate.familyKey)
    ));
  }

  private cleanupTarget(target: TargetQueueState): void {
    if (target.pending.length > 0 || target.activeCount > 0) {
      return;
    }

    this.targets.delete(target.targetKey);
    const index = this.targetOrder.indexOf(target.targetKey);
    if (index >= 0) {
      this.targetOrder.splice(index, 1);
    }
  }

  private async execute<T>(task: QueueTask<T>): Promise<void> {
    const { execute, resolve, reject, options, operation } = task;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutMs = options.timeoutMs;
    const timeoutPromise =
      typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? new Promise<never>((_resolve, rejectTimeout) => {
            timeoutHandle = setTimeout(() => {
              rejectTimeout(
                createTimeoutError(operation, timeoutMs, options.timeoutMessage, options.details)
              );
            }, timeoutMs);
          })
        : null;

    let executionPromise: Promise<T>;
    try {
      executionPromise = Promise.resolve(execute());
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
      return;
    }

    try {
      const result = timeoutPromise
        ? await Promise.race([executionPromise, timeoutPromise])
        : await executionPromise;
      resolve(result as T);
    } catch (error) {
      reject(error);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
