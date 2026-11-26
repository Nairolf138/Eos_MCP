/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApprovalChallenge, consumeOperatorApproval, grantOperatorApproval, inspectApprovalChallenge } from '../operatorApproval';

describe('separate operator approval', () => {
  const originalSecret = process.env.EOS_OPERATOR_APPROVAL_SECRET;
  beforeEach(() => { process.env.EOS_OPERATOR_APPROVAL_SECRET = '0123456789abcdef0123456789abcdef'; });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.EOS_OPERATOR_APPROVAL_SECRET;
    else process.env.EOS_OPERATOR_APPROVAL_SECRET = originalSecret;
  });

  it('binds a one-time code to the tool, target and arguments', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eos-approval-'));
    try {
      const target = { address: '192.0.2.10', port: 8001, name: 'main' };
      const challenge = buildApprovalChallenge('eos_cue_go', { cue: 4, confirm: true }, target);
      const token = await grantOperatorApproval(directory, challenge);
      const altered = buildApprovalChallenge('eos_cue_go', { cue: 5, confirm: true }, target);
      expect(await consumeOperatorApproval(directory, token, altered)).toBe(false);
      expect(await consumeOperatorApproval(directory, token, challenge)).toBe(false);

      const secondToken = await grantOperatorApproval(directory, challenge);
      expect(await consumeOperatorApproval(directory, secondToken,
        buildApprovalChallenge('eos_cue_go', { confirm: true, cue: 4 }, target))).toBe(true);
      expect(await consumeOperatorApproval(directory, secondToken, challenge)).toBe(false);

      const thirdToken = await grantOperatorApproval(directory, challenge);
      const weakerSafety = buildApprovalChallenge('eos_cue_go', { cue: 4, confirm: true, safety_level: 'off' }, target);
      expect(await consumeOperatorApproval(directory, thirdToken, weakerSafety)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a challenge with an altered operator preview', () => {
    const challenge = buildApprovalChallenge('eos_cue_go', { cue: 4 }, { address: '192.0.2.10', port: 8001 });
    const altered = JSON.parse(Buffer.from(challenge, 'base64url').toString('utf8')) as { preview: string };
    altered.preview = '{"cue":5}';
    expect(() => inspectApprovalChallenge(Buffer.from(JSON.stringify(altered)).toString('base64url')))
      .toThrow('Signature du challenge invalide');
  });
});
