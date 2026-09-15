/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  sessionId?: string;
  userId?: number;
  toolName?: string;
  dryRun?: boolean;
  oscPreview?: Array<{ address: string; args: unknown[] }>;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, action: () => Promise<T>): Promise<T> {
  return requestContextStorage.run(context, action);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
