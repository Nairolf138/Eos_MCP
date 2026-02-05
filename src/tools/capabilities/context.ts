let toolNamesProvider: (() => string[]) | null = null;

export function setCapabilitiesToolNamesProvider(provider: (() => string[]) | null): void {
  toolNamesProvider = provider;
}

export function getCapabilitiesToolNames(): string[] {
  return toolNamesProvider ? toolNamesProvider() : [];
}
