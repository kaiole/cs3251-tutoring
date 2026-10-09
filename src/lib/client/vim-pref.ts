/**
 * Per-browser "Vim keys" preference for the composer. A convenience only: storage may be missing,
 * blocked or throwing (private windows, SSR), in which case Vim is simply off.
 */
const KEY = 'tq:vim';

type PrefStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const browserStorage = (): PrefStorage => localStorage;

export function loadVimPref(storage: () => PrefStorage = browserStorage): boolean {
  try {
    return storage().getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveVimPref(on: boolean, storage: () => PrefStorage = browserStorage): void {
  try {
    if (on) storage().setItem(KEY, '1');
    else storage().removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
