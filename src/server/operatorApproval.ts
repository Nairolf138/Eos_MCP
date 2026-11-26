/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const APPROVAL_LIFETIME_MS = 2 * 60_000;
const APPROVAL_TOKEN_PATTERN = /^[a-f0-9-]{36}$/i;
const EXCLUDED_KEYS = new Set(['operator_approval']);

export interface ApprovalTarget { address: string; port: number; name?: string }
interface Challenge { version: 1; tool: string; target: ApprovalTarget; digest: string; preview: string; signature: string }
interface Grant extends Challenge { expiresAt: number }

function stable(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.map((entry) => stable(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => depth > 0 || !EXCLUDED_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stable(entry, depth + 1)]));
  }
  return value;
}

export function buildApprovalChallenge(tool: string, args: unknown, target: ApprovalTarget): string {
  const canonicalArgs = JSON.stringify(stable(args) ?? null);
  const digest = createHash('sha256').update(canonicalArgs).digest('hex');
  const preview = canonicalArgs.length > 700 ? `${canonicalArgs.slice(0, 700)}… (tronque)` : canonicalArgs;
  const payload = { version: 1 as const, tool, target, digest, preview };
  const challenge: Challenge = { ...payload, signature: sign(payload) };
  return Buffer.from(JSON.stringify(challenge)).toString('base64url');
}

export function inspectApprovalChallenge(encoded: string): Challenge {
  const challenge = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Challenge;
  if (challenge.version !== 1 || typeof challenge.tool !== 'string' || !/^[a-z0-9_]+$/.test(challenge.tool)
    || !/^[a-f0-9]{64}$/.test(challenge.digest) || typeof challenge.preview !== 'string'
    || !/^[a-f0-9]{64}$/.test(challenge.signature)
    || typeof challenge.target?.address !== 'string'
    || !Number.isInteger(challenge.target.port)) throw new Error('Challenge d approbation invalide.');
  const { signature, ...payload } = challenge;
  const expected = Buffer.from(sign(payload), 'hex');
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw new Error('Signature du challenge invalide.');
  return challenge;
}

function sign(payload: Omit<Challenge, 'signature'>): string {
  const secret = process.env.EOS_OPERATOR_APPROVAL_SECRET;
  if (!secret || secret.length < 32) throw new Error('EOS_OPERATOR_APPROVAL_SECRET doit contenir au moins 32 caracteres.');
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export async function grantOperatorApproval(directory: string, encoded: string): Promise<string> {
  const challenge = inspectApprovalChallenge(encoded);
  const token = randomUUID();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = await open(path.join(directory, `${token}.json`), 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify({ ...challenge, expiresAt: Date.now() + APPROVAL_LIFETIME_MS } satisfies Grant));
  } finally {
    await file.close();
  }
  return token;
}

export async function consumeOperatorApproval(directory: string, token: string, encoded: string): Promise<boolean> {
  if (!APPROVAL_TOKEN_PATTERN.test(token)) return false;
  const source = path.join(directory, `${token}.json`);
  const claimed = path.join(directory, `${token}.used`);
  try {
    // The rename claims the approval exactly once before it can authorize a send.
    await rename(source, claimed);
    try {
      const grant = JSON.parse(await readFile(claimed, 'utf8')) as Grant;
      const expected = inspectApprovalChallenge(encoded);
      return grant.expiresAt > Date.now() && grant.version === expected.version
        && grant.tool === expected.tool && grant.digest === expected.digest
        && grant.target.address === expected.target.address && grant.target.port === expected.target.port
        && grant.target.name === expected.target.name && grant.signature === expected.signature;
    } finally {
      await unlink(claimed);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
