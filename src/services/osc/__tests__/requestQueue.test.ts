import { ErrorCode } from '../../../server/errors';
import { RequestQueue } from '../requestQueue';

describe('RequestQueue', () => {
  it('limite le nombre de taches actives', async () => {
    const queue = new RequestQueue({ concurrency: 2 });
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 6 }, (_, index) =>
      queue.run(`task-${index}`, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return index;
      })
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('propage les erreurs des taches', async () => {
    const queue = new RequestQueue({ concurrency: 1 });
    const error = new Error('failure');

    await expect(
      queue.run('task-error', async () => {
        throw error;
      })
    ).rejects.toBe(error);
  });

  it('declenche un timeout personnalise', async () => {
    const queue = new RequestQueue({ concurrency: 1 });

    await expect(
      queue.run(
        'operation lente',
        async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        },
        { timeoutMs: 5 }
      )
    ).rejects.toMatchObject({ code: ErrorCode.OSC_TIMEOUT });
  });
});
