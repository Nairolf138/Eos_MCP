/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAuditMode, sanitizeAuditValue, writeCommandAudit } from '../index';

describe('command audit', () => {
  it('masque les champs et fragments sensibles', () => {
    expect(sanitizeAuditValue({
      apiKey: 'abc123',
      nested: { authorization: 'Bearer secret-token', text: 'token=visible-secret Chan 1' }
    })).toEqual({
      apiKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]', text: 'token=[REDACTED] Chan 1' }
    });
  });

  it('ecrit une ligne JSONL lorsque l audit est active', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'eos-mcp-audit-test-'));
    const logFile = join(tempDir, 'audit.log');

    try {
      writeCommandAudit({
        timestamp: '2026-06-06T00:00:00.000Z',
        toolName: 'eos_command',
        oscAddress: '/eos/cmd',
        args: [{ type: 's', value: 'Chan 1 At 50 token=abc' }],
        eosUser: 3,
        mode: 'strict',
        delivery: 'sent',
        status: 'ok',
        result: { password: 'hidden' }
      }, { enabled: true, logFile });

      const [line] = readFileSync(logFile, 'utf8').trim().split('\n');
      expect(JSON.parse(line!)).toMatchObject({
        timestamp: '2026-06-06T00:00:00.000Z',
        toolName: 'eos_command',
        oscAddress: '/eos/cmd',
        eosUser: 3,
        mode: 'strict',
        delivery: 'sent',
        status: 'ok',
        result: { password: '[REDACTED]' }
      });
      expect(line).toContain('token=[REDACTED]');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('derive le mode depuis EOS_STRICT_MODE', () => {
    expect(resolveAuditMode({ EOS_STRICT_MODE: 'true' } as NodeJS.ProcessEnv)).toBe('strict');
    expect(resolveAuditMode({ EOS_STRICT_MODE: 'false' } as NodeJS.ProcessEnv)).toBe('compatibility');
  });
});
