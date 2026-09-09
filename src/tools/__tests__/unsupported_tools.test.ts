/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import tools from '../index';
import { eosWorkflowCreateEffectTool } from '../workflows';
import { eosSetCueSendStringTool, eosSetCueReceiveStringTool } from '../showControl';
import { OscClient, setOscClient } from '../../services/osc/client';
import { runTool } from './helpers/runTool';

describe('Unimplemented operations are not advertised or sent to Eos', () => {
  const send = jest.fn(async () => {});
  beforeEach(() => { send.mockClear(); setOscClient(new OscClient({ send, onMessage: () => () => {} })); });
  afterEach(() => setOscClient(null));
  test.each([
    [eosWorkflowCreateEffectTool, { channels: '1 Thru 5', effect_number: 17 }],
    [eosSetCueSendStringTool, { format_string: '/cue/%1/%2' }],
    [eosSetCueReceiveStringTool, { format_string: '/cue/%1/%2' }]
  ] as const)('%s is absent from discovery and fails before console traffic', async (tool, args) => {
    expect(tools.some(candidate => candidate.name === tool.name)).toBe(false);
    const variants = tool === eosWorkflowCreateEffectTool
      ? [{ dry_run: true }, { dry_run: false, require_confirmation: true }]
      : [{}];
    for (const options of variants) {
      const result = await runTool(tool, { ...args, ...options });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({status: 'unsupported', verified: false});
      expect(send).not.toHaveBeenCalled();
    }
  });
});
