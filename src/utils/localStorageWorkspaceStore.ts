import type { StoredWorkspaceV3 } from './notepadTypes';

const FALLBACK_KEY = 'react-notepad-workspace-v3-fallback';

function isStoredWorkspaceV3(value: unknown): value is StoredWorkspaceV3 {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === 3 &&
    Array.isArray((value as { documents?: unknown }).documents) &&
    typeof (value as { activeDocumentId?: unknown }).activeDocumentId === 'string'
  );
}

export function getFallbackWorkspace(): StoredWorkspaceV3 | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw === null) return null;

    const parsed = JSON.parse(raw);
    if (!isStoredWorkspaceV3(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function putFallbackWorkspace(workspace: StoredWorkspaceV3): void {
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage is not available in this environment.');
  }

  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace));
  } catch (e) {
    throw new Error('Failed to write workspace to localStorage.', { cause: e });
  }
}
