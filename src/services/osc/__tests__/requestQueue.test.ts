/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { ErrorCode } from '../../../server/errors';
import { RequestQueue } from '../requestQueue';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('RequestQueue', () => {
  it('execute les taches FIFO pour une meme cible serialisee', async () => {
    const queue = new RequestQueue({ concurrency: 1 });
    const starts: string[] = [];
    const completions: string[] = [];

    const tasks = ['a', 'b', 'c'].map((name) =>
      queue.run(name, async () => {
        starts.push(name);
        await delay(2);
        completions.push(name);
        return name;
      })
    );

    await expect(Promise.all(tasks)).resolves.toEqual(['a', 'b', 'c']);
    expect(starts).toEqual(['a', 'b', 'c']);
    expect(completions).toEqual(['a', 'b', 'c']);
  });

  it('declenche un timeout personnalise et libere la tache suivante', async () => {
    const queue = new RequestQueue({ concurrency: 1 });
    const starts: string[] = [];

    const timeout = queue.run(
      'operation lente',
      async () => {
        starts.push('slow');
        await delay(30);
      },
      { timeoutMs: 5 }
    );
    const next = queue.run('operation suivante', async () => {
      starts.push('next');
      return 'done';
    });

    await expect(timeout).rejects.toMatchObject({ code: ErrorCode.OSC_TIMEOUT });
    await expect(next).resolves.toBe('done');
    expect(starts).toEqual(['slow', 'next']);
  });

  it('propage l erreur d une tache sans bloquer les suivantes', async () => {
    const queue = new RequestQueue({ concurrency: 1 });
    const error = new Error('failure');
    const starts: string[] = [];

    const failing = queue.run('task-error', async () => {
      starts.push('failing');
      throw error;
    });
    const next = queue.run('task-next', async () => {
      starts.push('next');
      return 'ok';
    });

    await expect(failing).rejects.toBe(error);
    await expect(next).resolves.toBe('ok');
    expect(starts).toEqual(['failing', 'next']);
  });

  it('autorise une concurrence superieure a 1 tout en respectant la limite configuree', async () => {
    const queue = new RequestQueue({ concurrency: 3 });
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 8 }, (_, index) =>
      queue.run(`task-${index}`, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(5);
        active -= 1;
        return index;
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it('isole la concurrence par cible et expose des diagnostics', async () => {
    const queue = new RequestQueue({ concurrency: 1 });
    const starts: string[] = [];

    const first = queue.run(
      'target-a',
      async () => {
        starts.push('a');
        await delay(15);
      },
      { targetKey: 'console-a' }
    );
    const second = queue.run(
      'target-b',
      async () => {
        starts.push('b');
      },
      { targetKey: 'console-b' }
    );

    await delay(1);
    expect(starts).toEqual(['a', 'b']);
    expect(queue.getDiagnostics()).toMatchObject({
      pending: 0,
      activeCount: 1,
      concurrency: 1
    });

    await Promise.all([first, second]);
    expect(queue.getDiagnostics()).toEqual({
      pending: 0,
      activeCount: 0,
      concurrency: 1,
      targets: []
    });
  });

  it('verrouille une famille sensible sans bloquer les familles paralleles', async () => {
    const queue = new RequestQueue({ concurrency: 2 });
    const starts: string[] = [];

    const first = queue.run(
      'cmd-1',
      async () => {
        starts.push('cmd-1');
        await delay(15);
      },
      { familyKey: 'command-line' }
    );
    const second = queue.run(
      'cmd-2',
      async () => {
        starts.push('cmd-2');
      },
      { familyKey: 'command-line' }
    );
    const read = queue.run('read', async () => {
      starts.push('read');
    });

    await delay(1);
    expect(starts).toEqual(['cmd-1', 'read']);
    await first;
    await Promise.all([second, read]);
    expect(starts).toEqual(['cmd-1', 'read', 'cmd-2']);
  });
});
