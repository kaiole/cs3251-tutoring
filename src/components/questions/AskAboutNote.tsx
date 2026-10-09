import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession, type SessionState } from '../../lib/client/api';
import { captureSelection, type SelectionSnapshot } from '../../lib/client/selection';
import { LIMITS } from '../../lib/validation';
import AskPanel from './AskPanel';
import { ASK_EVENT } from './AskRail';
import Composer, { type ComposerSource } from './Composer';

interface NoteInfo {
  noteId: string;
  title: string;
  path: string;
  revision: string;
}

type Floating =
  | { kind: 'ask'; top: number; left: number; snapshot: SelectionSnapshot }
  | { kind: 'too_long'; top: number; left: number };

const REVISION_OK = /^[A-Za-z0-9._-]{1,64}$/;

export default function AskAboutNote({ note }: { note: NoteInfo }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const [composerSource, setComposerSource] = useState<ComposerSource | null | undefined>(undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
  }, []);
  const isStudent = session?.signedIn === true && session.role === 'student' && Boolean(session.userId);

  const baseSource = useCallback(
    (snapshot?: SelectionSnapshot): ComposerSource => ({
      noteId: note.noteId,
      title: note.title,
      path: note.path,
      ...(REVISION_OK.test(note.revision) ? { revision: note.revision } : {}),
      ...(snapshot?.heading ? { heading: snapshot.heading } : {}),
      ...(snapshot?.headingText ? { headingText: snapshot.headingText } : {}),
      ...(snapshot
        ? {
            excerpt: {
              text: snapshot.text,
              kind: snapshot.kind,
              ...(snapshot.language ? { language: snapshot.language } : {}),
            },
          }
        : {}),
    }),
    [note],
  );

  const open = useCallback((source: ComposerSource) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFloating(null);
    setComposerSource(source);
  }, []);

  // Show / close the native modal dialog (focus trap, Escape, aria-modal) and restore focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (composerSource !== undefined && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first control (Close); start in the question field instead
      // (the code editor, or the plain textarea it replaces while loading).
      dialog.querySelector<HTMLElement>('[data-composer-body]')?.focus();
    }
    if (composerSource === undefined && dialog.open) dialog.close();
  }, [composerSource]);

  const close = useCallback(() => {
    setComposerSource(undefined);
    triggerRef.current?.focus();
  }, []);

  // Sidebar button.
  useEffect(() => {
    if (!isStudent) return;
    const onAsk = () => open(baseSource());
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [isStudent, open, baseSource]);

  // Highlight → Ask. Never interferes with normal selection/copy: we only read the selection.
  useEffect(() => {
    if (!isStudent) return;
    const root = document.querySelector('[data-note-content]');
    if (!root) return;
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dialogRef.current?.open) return;
        const result = captureSelection(root);
        const sel = window.getSelection();
        if (!result || !sel || sel.rangeCount === 0) {
          setFloating(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const top = Math.max(rect.top + window.scrollY - 48, window.scrollY + 8);
        const left = Math.min(Math.max(rect.left + window.scrollX, 8), window.scrollX + window.innerWidth - 200);
        setFloating(result.ok ? { kind: 'ask', top, left, snapshot: result.snapshot } : { kind: 'too_long', top, left });
      }, 150);
    };
    document.addEventListener('selectionchange', check);
    return () => {
      document.removeEventListener('selectionchange', check);
      window.clearTimeout(timer);
    };
  }, [isStudent]);

  return (
    <>
      <div className="tq-ask-inline">
        <AskPanel noteId={note.noteId} onAsk={() => open(baseSource())} />
      </div>

      {floating && (
        <div className="tq-floating" style={{ top: floating.top, left: floating.left }} data-tq-ui>
          {floating.kind === 'ask' ? (
            <button
              type="button"
              className="tq-button tq-button--primary tq-button--small"
              // Keep the selection while clicking.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => open(baseSource(floating.snapshot))}
            >
              Ask about this
            </button>
          ) : (
            <p className="tq-floating__note" role="status">
              This selection is longer than {LIMITS.excerpt.toLocaleString('en-US')} characters. Select a smaller part
              of the note and try again.
            </p>
          )}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="tq-dialog"
        aria-labelledby="tq-composer-title"
        onClose={() => composerSource !== undefined && close()}
        data-tq-ui
      >
        {composerSource !== undefined && session?.userId && (
          <>
            <header className="tq-dialog__head">
              <h2 id="tq-composer-title">{composerSource ? 'Ask about this note' : 'Ask a question'}</h2>
              <button type="button" className="tq-icon-button" aria-label="Close" onClick={close}>
                ×
              </button>
            </header>
            <Composer
              mode="question"
              userId={session.userId}
              draftScope={`question:note:${note.noteId}`}
              initialSource={composerSource}
              autoFocus
              onCancel={close}
              onSaved={(id) => location.assign(`/questions/${id}?saved=1`)}
            />
          </>
        )}
      </dialog>
    </>
  );
}
