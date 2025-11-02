const manualReadStatus = new Map<string, boolean>();
const FALLBACK_SESSION_KEY = '__global__';

function normaliseSessionId(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return FALLBACK_SESSION_KEY;
  }

  const trimmed = sessionId.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

export function markManualDocumentationRead(sessionId: string | undefined): void {
  const key = normaliseSessionId(sessionId);
  if (!key) {
    return;
  }

  manualReadStatus.set(key, true);
}

export function hasSessionReadManual(sessionId: string | undefined): boolean {
  const key = normaliseSessionId(sessionId);
  if (!key) {
    return false;
  }

  return manualReadStatus.get(key) === true;
}

export function clearManualDocumentationRead(sessionId: string | undefined): void {
  const key = normaliseSessionId(sessionId);
  if (!key) {
    return;
  }

  manualReadStatus.delete(key);
}
