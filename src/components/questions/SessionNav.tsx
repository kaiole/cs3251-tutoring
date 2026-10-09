import { useEffect, useState } from 'react';
import { api, getSession, type SessionState } from '../../lib/client/api';
import { clearAllDrafts } from '../../lib/client/drafts';

/** Header Sign in / Sign out. Static HTML renders "Sign in" for everyone; the session is fetched after load. */
export default function SessionNav() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getSession().then(setSession);
  }, []);

  if (session?.signedIn) {
    return (
      <button
        type="button"
        className="tq-nav-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          clearAllDrafts();
          try {
            await api('/api/auth/logout', { method: 'POST', body: {} });
          } finally {
            location.assign('/');
          }
        }}
      >
        Sign out
      </button>
    );
  }
  // Same markup as the static HTML until the session is known (no hydration mismatch).
  const next = session ? `?next=${encodeURIComponent(location.pathname)}` : '';
  return <a href={`/login${next}`}>Sign in</a>;
}
