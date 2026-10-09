import { useEffect, useState } from 'react';
import { getSession, type SessionState } from '../../lib/client/api';

/** Note-page entry point for signed-in participants only (session fetched after load). */
export default function AskPanel({ noteId, onAsk }: { noteId: string; onAsk: () => void }) {
  const [session, setSession] = useState<SessionState | null>(null);
  useEffect(() => {
    void getSession().then(setSession);
  }, []);

  // Visitors (and anyone while the session is loading or unavailable) just see the note.
  if (!session?.signedIn || !session.role) return null;

  return (
    <section className="tq-ask-panel">
      {session.role === 'student' ? (
        <button type="button" className="tq-button tq-button--primary tq-button--block" onClick={onAsk}>
          Ask about this note
        </button>
      ) : (
        <a className="tq-button tq-button--secondary tq-button--block" href={`/questions?filter=all&note=${encodeURIComponent(noteId)}`}>
          Questions about this note
        </a>
      )}
    </section>
  );
}
