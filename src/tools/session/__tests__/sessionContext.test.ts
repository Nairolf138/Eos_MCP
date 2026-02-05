import {
  clearSessionContext,
  sessionClearContextTool,
  sessionGetContextTool,
  sessionSetContextTool
} from '../index';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

describe('session context tools', () => {
  beforeEach(() => {
    clearSessionContext();
  });

  it('enregistre puis retourne le contexte courant', async () => {
    const context = {
      show: 'Concert 2026',
      active_cuelist: 12,
      selected_channels: [1, 2, 3],
      selected_groups: [10, 20],
      recent_palettes: [
        { type: 'color', id: 5, label: 'Blue' },
        { type: 'focus', id: 2 }
      ]
    };

    const setResult = await runTool(sessionSetContextTool, { context, ttl_ms: 5000 });
    const setStructuredContent = getStructuredContent(setResult);

    expect(setStructuredContent).toBeDefined();
    if (!setStructuredContent) {
      throw new Error('Expected structured content');
    }
    expect(setStructuredContent).toMatchObject({
      context,
      ttl_ms: 5000
    });
    expect(setStructuredContent.suggested_next_actions).toBeDefined();

    const getResult = await runTool(sessionGetContextTool, undefined);
    const getStructured = getStructuredContent(getResult);

    expect(getStructured).toBeDefined();
    if (!getStructured) {
      throw new Error('Expected structured content');
    }

    expect(getStructured).toMatchObject({ context });
    expect(getStructured.suggested_next_actions).toBeDefined();
  });

  it('expire le contexte apres le ttl configure', async () => {
    jest.useFakeTimers();
    try {
      const context = {
        show: 'Test Show',
        active_cuelist: 'Main',
        selected_channels: [101],
        selected_groups: [7],
        recent_palettes: [{ id: 1 }]
      };

      await runTool(sessionSetContextTool, { context, ttl_ms: 10 });
      jest.advanceTimersByTime(11);

      const result = await runTool(sessionGetContextTool, undefined);
      const structured = getStructuredContent(result);

      expect(structured).toBeDefined();
      if (!structured) {
        throw new Error('Expected structured content');
      }

      expect(structured.context).toBeNull();
      expect(structured.suggested_next_actions).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('efface le contexte via le tool de reset', async () => {
    await runTool(sessionSetContextTool, {
      context: {
        show: 'Avant reset',
        selected_channels: [4],
        selected_groups: [2],
        recent_palettes: [{ id: 8 }]
      }
    });

    const clearResult = await runTool(sessionClearContextTool, undefined);
    const clearStructured = getStructuredContent(clearResult);

    expect(clearStructured).toBeDefined();
    if (!clearStructured) {
      throw new Error('Expected structured content');
    }
    expect(clearStructured.context).toBeNull();
    expect(clearStructured.suggested_next_actions).toBeDefined();

    const getResult = await runTool(sessionGetContextTool, undefined);
    const getStructured = getStructuredContent(getResult);

    expect(getStructured).toBeDefined();
    if (!getStructured) {
      throw new Error('Expected structured content');
    }
    expect(getStructured.context).toBeNull();
  });
});
