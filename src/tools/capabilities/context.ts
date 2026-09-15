/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: AGPL-3.0-only
 */
let toolNamesProvider: (() => string[]) | null = null;

export function setCapabilitiesToolNamesProvider(provider: (() => string[]) | null): void {
  toolNamesProvider = provider;
}

export function getCapabilitiesToolNames(): string[] {
  return toolNamesProvider ? toolNamesProvider() : [];
}
