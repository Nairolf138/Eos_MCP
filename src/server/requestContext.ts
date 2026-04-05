/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  sessionId?: string;
  userId?: number;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, action: () => Promise<T>): Promise<T> {
  return requestContextStorage.run(context, action);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

