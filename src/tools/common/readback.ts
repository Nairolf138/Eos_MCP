/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { OscJsonResponse } from '../../services/osc/client';

/** Allow Eos to apply a write; retry reads only, never replay a mutating command. */
export async function pollReadback(
  read: (remainingMs: number) => Promise<OscJsonResponse>,
  matches: (data: unknown) => boolean,
  timeoutMs: number
): Promise<OscJsonResponse> {
  const deadline = Date.now() + timeoutMs;
  let response: OscJsonResponse;
  do {
    response = await read(Math.max(1, deadline - Date.now()));
    if (response.status === 'ok' && matches(response.data)) return response;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)));
  } while (Date.now() < deadline);
  return response!;
}
