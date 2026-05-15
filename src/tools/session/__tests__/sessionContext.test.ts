/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  clearAllSessionContexts,
  cleanupExpiredSessionContexts,
  configureSessionContextPersistence,
  sessionClearContextTool,
  sessionGetContextTool,
  sessionSetContextTool
} from '../index';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

describe('session context tools', () => {
  beforeEach(async () => {
    configureSessionContextPersistence({ mode: 'memory' });
    await clearAllSessionContexts();
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

    const getResult = await runTool(sessionGetContextTool, {});
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

      const result = await runTool(sessionGetContextTool, {});
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

    const clearResult = await runTool(sessionClearContextTool, {});
    const clearStructured = getStructuredContent(clearResult);

    expect(clearStructured).toBeDefined();
    if (!clearStructured) {
      throw new Error('Expected structured content');
    }
    expect(clearStructured.context).toBeNull();
    expect(clearStructured.suggested_next_actions).toBeDefined();

    const getResult = await runTool(sessionGetContextTool, {});
    const getStructured = getStructuredContent(getResult);

    expect(getStructured).toBeDefined();
    if (!getStructured) {
      throw new Error('Expected structured content');
    }
    expect(getStructured.context).toBeNull();
  });

  it('isole deux agents concurrents avec des contextes differents', async () => {
    const agentAContext = {
      show: 'Show Agent A',
      active_cuelist: 1,
      selected_channels: [1, 2]
    };
    const agentBContext = {
      show: 'Show Agent B',
      active_cuelist: 2,
      selected_channels: [11, 12]
    };

    await Promise.all([
      runTool(sessionSetContextTool, { agent_id: 'agent-a', context: agentAContext }),
      runTool(sessionSetContextTool, { agent_id: 'agent-b', context: agentBContext })
    ]);

    const [agentAResult, agentBResult] = await Promise.all([
      runTool(sessionGetContextTool, { agent_id: 'agent-a' }),
      runTool(sessionGetContextTool, { agent_id: 'agent-b' })
    ]);

    expect(getStructuredContent(agentAResult)).toMatchObject({
      context: agentAContext,
      context_identity: { source: 'agent_id', id: 'agent-a' }
    });
    expect(getStructuredContent(agentBResult)).toMatchObject({
      context: agentBContext,
      context_identity: { source: 'agent_id', id: 'agent-b' }
    });
  });

  it('nettoie explicitement les contextes expires', async () => {
    jest.useFakeTimers();
    try {
      await runTool(sessionSetContextTool, {
        agent_id: 'agent-expire',
        context: { show: 'Expired' },
        ttl_ms: 10
      });
      jest.advanceTimersByTime(11);

      await expect(cleanupExpiredSessionContexts()).resolves.toBe(1);
      const result = await runTool(sessionGetContextTool, { agent_id: 'agent-expire' });
      expect(getStructuredContent(result)).toMatchObject({ context: null });
    } finally {
      jest.useRealTimers();
    }
  });


  it('persiste les contextes en fichier local lorsque configure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eos-mcp-session-context-'));
    const filePath = join(directory, 'contexts.json');
    try {
      const context = { show: 'Persisted file context' };
      configureSessionContextPersistence({ mode: 'file', filePath });

      await runTool(sessionSetContextTool, { mcp_session_id: 'session-file', context });
      const result = await runTool(sessionGetContextTool, { mcp_session_id: 'session-file' });

      expect(getStructuredContent(result)).toMatchObject({
        context,
        persistence: 'file',
        context_identity: { source: 'mcp_session_id', id: 'session-file' }
      });
    } finally {
      configureSessionContextPersistence({ mode: 'memory' });
      await rm(directory, { recursive: true, force: true });
    }
  });

});
