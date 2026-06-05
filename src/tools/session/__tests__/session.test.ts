/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  clearCurrentUserId,
  clearAllSessionContexts,
  configureSessionContextPersistence,
  getCurrentUserId,
  eosSetUserIdTool,
  sessionGetCurrentUserTool,
  sessionSetCurrentUserTool
} from '../index';
import { setOscClient, type OscClient, type TargetOptions } from '../../../services/osc/client';
import type { OscMessageArgument } from '../../../services/osc';
import { getStructuredContent, runTool } from '../../__tests__/helpers/runTool';

class MockOscClient {
  public readonly calls: Array<{ address: string; args: OscMessageArgument[]; options: TargetOptions }> = [];

  public async sendMessage(
    address: string,
    args: OscMessageArgument[] = [],
    options: TargetOptions = {}
  ): Promise<void> {
    this.calls.push({ address, args, options });
  }
}

describe('session tools', () => {
  let oscClient: MockOscClient;

  beforeEach(async () => {
    configureSessionContextPersistence({ mode: 'memory' });
    clearCurrentUserId();
    oscClient = new MockOscClient();
    setOscClient(oscClient as unknown as OscClient);
    await clearAllSessionContexts();
  });

  afterEach(() => {
    setOscClient(null);
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
    expect(structuredContent).toMatchObject({ user: 7 });
    expect(structuredContent.suggested_next_actions).toBeDefined();
  });

  it('envoie /eos/user avec un argument OSC entier pour definir l utilisateur console', async () => {
    const result = await runTool(eosSetUserIdTool, {
      user_id: 4,
      targetAddress: '192.0.2.10',
      targetPort: 3032
    });

    expect(oscClient.calls).toEqual([
      {
        address: '/eos/user',
        args: [{ type: 'i', value: 4 }],
        options: { targetAddress: '192.0.2.10', targetPort: 3032 }
      }
    ]);
    expect(getCurrentUserId()).toBe(4);
    expect(getStructuredContent(result)).toMatchObject({
      action: 'set_user_id',
      user_id: 4,
      osc: {
        address: '/eos/user',
        args: [{ type: 'i', value: 4 }]
      }
    });
  });

  it('renvoie null lorsqu aucun utilisateur nest defini', async () => {
    const result = await runTool(sessionGetCurrentUserTool, undefined);

    const structuredContent = getStructuredContent(result);
    expect(structuredContent).toBeDefined();
    if (!structuredContent) {
      throw new Error('Expected structured content');
    }
    expect(structuredContent).toMatchObject({ user: null });
    expect(structuredContent.suggested_next_actions).toBeDefined();
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
    expect(structuredContent).toMatchObject({ user: 3 });
    expect(structuredContent.suggested_next_actions).toBeDefined();
  });
});
