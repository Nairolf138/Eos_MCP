import {
  clearCurrentUserId,
  getCurrentUserId,
  sessionGetCurrentUserTool,
  sessionSetCurrentUserTool
} from '../index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

describe('session tools', () => {
  beforeEach(() => {
    clearCurrentUserId();
  });

  it('stocke le numero utilisateur via le tool de configuration', async () => {
    const result = await runTool(sessionSetCurrentUserTool, { user: 7 });

    expect(getCurrentUserId()).toBe(7);
    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toEqual({ user: 7 });
  });

  it('renvoie null lorsqu aucun utilisateur nest defini', async () => {
    const result = await runTool(sessionGetCurrentUserTool, undefined);

    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toEqual({ user: null });
  });

  it('renvoie l utilisateur courant memorise', async () => {
    clearCurrentUserId();
    await runTool(sessionSetCurrentUserTool, { user: 3 });

    const result = await runTool(sessionGetCurrentUserTool, undefined);
    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toEqual({ user: 3 });
  });
});
