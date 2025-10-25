import { createTimeoutError } from '../../server/errors';

export interface RequestQueueOptions {
  concurrency?: number;
}

export interface RequestQueueRunOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
  details?: Record<string, unknown>;
}

interface QueueTask<T> {
  readonly operation: string;
  readonly execute: () => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
  readonly options: RequestQueueRunOptions;
}

function normaliseConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
}

export class RequestQueue {
  private readonly concurrency: number;

  private readonly pending: QueueTask<unknown>[] = [];

  private activeCount = 0;

  constructor(options: RequestQueueOptions = {}) {
    this.concurrency = normaliseConcurrency(options.concurrency);
  }

  public async run<T>(
    operation: string,
    task: () => Promise<T>,
    options: RequestQueueRunOptions = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        operation,
        execute: task,
        resolve,
        reject,
        options
      };
      this.pending.push(queueTask as QueueTask<unknown>);
      this.process();
    });
  }

  private process(): void {
    while (this.activeCount < this.concurrency) {
      const next = this.pending.shift();
      if (!next) {
        return;
      }

      this.activeCount += 1;
      void this.execute(next).finally(() => {
        this.activeCount -= 1;
        this.process();
      });
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
