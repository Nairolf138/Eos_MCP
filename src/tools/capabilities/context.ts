/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
let toolNamesProvider: (() => string[]) | null = null;

export function setCapabilitiesToolNamesProvider(provider: (() => string[]) | null): void {
  toolNamesProvider = provider;
}

export function getCapabilitiesToolNames(): string[] {
  return toolNamesProvider ? toolNamesProvider() : [];
}
