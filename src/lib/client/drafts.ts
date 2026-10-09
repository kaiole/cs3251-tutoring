/**
 * Tab-scoped draft storage (sessionStorage). Not offline sync or a backup: drafts are bound to the
 * signed-in user id, expire after a day, and are cleared on submit, discard and sign-out.
 */
const PREFIX = 'tq:draft:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface Draft<T> {
  data: T;
  savedAt: number;
}

const key = (userId: string, scope: string) => `${PREFIX}${userId}:${scope}`;

export function loadDraft<T>(userId: string, scope: string): T | null {
  try {
    const raw = sessionStorage.getItem(key(userId, scope));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft<T>;
    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(key(userId, scope));
      return null;
    }
    return draft.data;
  } catch {
    return null;
  }
}

export function saveDraft<T>(userId: string, scope: string, data: T): void {
  try {
    sessionStorage.setItem(key(userId, scope), JSON.stringify({ data, savedAt: Date.now() } satisfies Draft<T>));
  } catch {
    /* storage full or blocked: drafts are best-effort */
  }
}

export function clearDraft(userId: string, scope: string): void {
  try {
    sessionStorage.removeItem(key(userId, scope));
  } catch {
    /* ignore */
  }
}

/** Called on sign-out: remove every draft in this tab, for every account. */
export function clearAllDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
