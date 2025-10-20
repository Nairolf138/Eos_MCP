import {
  clearCurrentUserId,
  getCurrentUserId,
  sessionGetCurrentUserTool,
  sessionSetCurrentUserTool
} from '../index';

describe('session tools', () => {
  const runTool = async (tool: any, args: unknown): Promise<any> => {
    const handler = tool.handler as (input: unknown, extra?: unknown) => Promise<any>;
    return handler(args, {});
  };

  beforeEach(() => {
    clearCurrentUserId();
  });

  it('stocke le numero utilisateur via le tool de configuration', async () => {
    const result = await runTool(sessionSetCurrentUserTool, { user: 7 });

    expect(getCurrentUserId()).toBe(7);
    expect(Array.isArray(result.content)).toBe(true);
    const objectContent = result.content.find((item: any) => item.type === 'object');
    expect(objectContent?.data).toEqual({ user: 7 });
  });

  it('renvoie null lorsqu aucun utilisateur nest defini', async () => {
    const result = await runTool(sessionGetCurrentUserTool, undefined);

    const objectContent = result.content.find((item: any) => item.type === 'object');
    expect(objectContent?.data).toEqual({ user: null });
  });

  it('renvoie l utilisateur courant memorise', async () => {
    clearCurrentUserId();
    await runTool(sessionSetCurrentUserTool, { user: 3 });

    const result = await runTool(sessionGetCurrentUserTool, undefined);
    const objectContent = result.content.find((item: any) => item.type === 'object');
    expect(objectContent?.data).toEqual({ user: 3 });
  });
});
