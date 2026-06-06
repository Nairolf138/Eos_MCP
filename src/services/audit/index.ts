/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getConfig } from '../../config/index';

const SENSITIVE_FIELD_PATTERN = /(token|password|secret|authorization|api[-_]?key|cookie|credential|passphrase)/i;
const SENSITIVE_STRING_PATTERN = /(bearer\s+)[A-Za-z0-9._~+\-/=]+|((?:token|password|secret|api[-_]?key)=)[^\s&]+/gi;

export type AuditMode = 'strict' | 'compatibility';
export type AuditDelivery = 'dry_run' | 'sent';
export type AuditStatus = 'ok' | 'error';

export interface AuditConfig {
  enabled: boolean;
  logFile: string;
}

export interface CommandAuditRecord {
  timestamp?: string;
  toolName: string;
  oscAddress: string | null;
  args: unknown;
  eosUser: number | null;
  mode: AuditMode;
  delivery: AuditDelivery;
  status: AuditStatus;
  result?: unknown;
  error?: unknown;
  correlationId?: string;
  sessionId?: string;
  target?: {
    console?: string;
    address?: string;
    port?: number;
  };
}

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[MaxDepth]';
  }

  if (typeof value === 'string') {
    return value.replace(SENSITIVE_STRING_PATTERN, (_match, bearerPrefix, keyPrefix) => `${bearerPrefix ?? keyPrefix}[REDACTED]`);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeAuditValue(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, entryValue]) => {
        if (SENSITIVE_FIELD_PATTERN.test(key)) {
          return [key, '[REDACTED]'];
        }
        return [key, sanitizeAuditValue(entryValue, depth + 1)];
      })
    );
  }

  return value;
}

export function resolveAuditMode(env: NodeJS.ProcessEnv = process.env): AuditMode {
  const raw = env.EOS_STRICT_MODE;
  return raw === 'true' || raw === '1' || raw === 'yes' ? 'strict' : 'compatibility';
}

export function getAuditConfig(): AuditConfig {
  return getConfig().audit;
}

export function writeCommandAudit(record: CommandAuditRecord, config: AuditConfig = getAuditConfig()): void {
  if (!config.enabled) {
    return;
  }

  const logFile = resolve(process.cwd(), config.logFile);
  mkdirSync(dirname(logFile), { recursive: true });
  const payload = {
    ...record,
    timestamp: record.timestamp ?? new Date().toISOString(),
    args: sanitizeAuditValue(record.args),
    result: sanitizeAuditValue(record.result),
    error: sanitizeAuditValue(record.error)
  };

  appendFileSync(logFile, `${JSON.stringify(payload)}\n`, 'utf8');
}
