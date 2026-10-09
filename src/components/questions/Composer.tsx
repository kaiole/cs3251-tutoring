import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, ApiError, newRequestId } from '../../lib/client/api';
import { clearDraft, loadDraft, saveDraft } from '../../lib/client/drafts';
import { codePointLength, LIMITS, type QuestionSource } from '../../lib/validation';
import Markdown from './Markdown';

export interface ComposerSource extends QuestionSource {
  /** Display-only label for the section (not stored). */
  headingText?: string;
}

interface DraftData {
  body: string;
  source: ComposerSource | null;
  /** Submission key and the exact payload it was first used with (idempotent retry). */
  requestId: string | null;
  attempted: string | null;
}

type Props = {
  userId: string;
  draftScope: string;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
} & (
  | { mode: 'question'; initialSource: ComposerSource | null }
  | { mode: 'reply'; questionId: string; reopensOnReply?: boolean }
);

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string; retry: boolean }
  | { kind: 'expired' };

export default function Composer(props: Props) {
  const ids = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initial = useMemo<DraftData>(() => {
    const stored = loadDraft<DraftData>(props.userId, props.draftScope);
    const fromProps = props.mode === 'question' ? props.initialSource : null;
    return {
      body: stored?.body ?? '',
      // A fresh selection wins over a stored one; otherwise keep what the draft had.
      source: fromProps?.excerpt ? fromProps : (stored?.source ?? fromProps),
      requestId: stored?.requestId ?? null,
      attempted: stored?.attempted ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId, props.draftScope]);

  const [draft, setDraft] = useState<DraftData>(initial);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (props.autoFocus) textareaRef.current?.focus();
  }, [props.autoFocus]);

  // Persist on every change so a refresh or session expiry never loses the text.
  useEffect(() => {
    if (draft.body || draft.source?.excerpt) saveDraft(props.userId, props.draftScope, draft);
  }, [draft, props.userId, props.draftScope]);

  const length = codePointLength(draft.body);
  const over = length - LIMITS.body;
  const blank = !/\S/.test(draft.body);
  const bodyError = touched && blank ? `Write your ${props.mode} before submitting.` : over > 0 ? `Shorten your ${props.mode} by ${over.toLocaleString('en-US')} characters.` : null;

  const pastedTooLong = codePointLength(pasted) > LIMITS.excerpt;

  function update(patch: Partial<DraftData>) {
    setDraft((d) => ({ ...d, ...patch }));
    if (status.kind === 'error') setStatus({ kind: 'idle' });
  }

  function effectiveSource(): QuestionSource | null {
    const s = draft.source;
    if (!s) return null;
    const { headingText: _omit, ...source } = s;
    if (!source.excerpt && pasteOpen && /\S/.test(pasted) && !pastedTooLong) {
      // Pasted text is explicitly user-supplied, never a verified quotation.
      source.excerpt = { text: pasted, kind: 'text' };
    }
    return source;
  }

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setTouched(true);
    if (blank || over > 0 || status.kind === 'saving' || (pasteOpen && pastedTooLong)) {
      textareaRef.current?.focus();
      return;
    }
    const payload =
      props.mode === 'question'
        ? { body: draft.body, source: effectiveSource() }
        : { body: draft.body };
    const payloadKey = JSON.stringify(payload);
    // Same payload → same key (server returns the original); changed payload → new key.
    const requestId = draft.requestId && draft.attempted === payloadKey ? draft.requestId : newRequestId();
    const next = { ...draft, requestId, attempted: payloadKey };
    setDraft(next);
    saveDraft(props.userId, props.draftScope, next);
    setStatus({ kind: 'saving' });

    try {
      const url = props.mode === 'question' ? '/api/questions' : `/api/questions/${props.questionId}/replies`;
      const result = await api<{ id: string }>(url, { method: 'POST', body: { requestId, ...payload } });
      clearDraft(props.userId, props.draftScope);
      setDraft({ body: '', source: null, requestId: null, attempted: null });
      setStatus({ kind: 'idle' });
      setTouched(false);
      props.onSaved(result.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setStatus({ kind: 'expired' });
      else if (err instanceof ApiError && err.status === 409 && props.mode === 'question') {
        // Key reused with different content (should not happen): start a new submission.
        update({ requestId: null, attempted: null });
        setStatus({ kind: 'error', message: "Couldn't save — your draft is kept.", retry: true });
      } else {
        const retry = !(err instanceof ApiError) || err.status === 0 || err.status >= 500 || err.status === 429;
        setStatus({
          kind: 'error',
          message: err instanceof ApiError && err.status !== 0 && err.status < 500 ? err.message : "Couldn't save — your draft is kept.",
          retry,
        });
      }
    }
  }

  function discard() {
    clearDraft(props.userId, props.draftScope);
    props.onCancel?.();
  }

  const source = props.mode === 'question' ? draft.source : null;
  const label = props.mode === 'question' ? 'Your question' : 'Your reply';

  return (
    <form className="tq-composer" onSubmit={submit} noValidate aria-busy={status.kind === 'saving'}>
      {props.mode === 'question' &&
        (source ? (
          <div className="tq-source-card">
            <span className="tq-source-card__label">From</span>
            <span className="tq-source-card__title">
              {source.title}
              {source.headingText ? <> → {source.headingText}</> : null}
            </span>
            <button type="button" className="tq-button tq-button--secondary tq-button--small" onClick={() => update({ source: null })}>
              Remove context
            </button>
          </div>
        ) : null)}

      {source?.excerpt && (
        <figure className="tq-quote">
          <figcaption>
            Your selection
            {source.excerpt.language && <span className="tq-badge tq-badge--neutral">{source.excerpt.language}</span>}
          </figcaption>
          {source.excerpt.kind === 'code' ? (
            <pre tabIndex={0}>
              <code>{source.excerpt.text}</code>
            </pre>
          ) : (
            <blockquote>{source.excerpt.text}</blockquote>
          )}
        </figure>
      )}

      {source && !source.excerpt && (
        <div className="tq-paste">
          {pasteOpen ? (
            <>
              <label htmlFor={`${ids}-paste`}>Quote a passage (optional)</label>
              <textarea
                id={`${ids}-paste`}
                className="tq-textarea tq-textarea--short"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                aria-describedby={pastedTooLong ? `${ids}-paste-hint` : undefined}
                aria-invalid={pastedTooLong}
                spellCheck={false}
              />
              {pastedTooLong && (
                <p id={`${ids}-paste-hint`} className="tq-error">
                  {`This passage is longer than ${LIMITS.excerpt.toLocaleString('en-US')} characters. Paste a smaller part.`}
                </p>
              )}
            </>
          ) : (
            <button type="button" className="tq-link-button" onClick={() => setPasteOpen(true)}>
              Paste a passage to quote (optional)
            </button>
          )}
        </div>
      )}

      <div className="tq-field">
        <div className="tq-field__head">
          <label htmlFor={`${ids}-body`}>{label}</label>
          <div role="tablist" aria-label="Editor mode" className="tq-tabs">
            <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>
              Write
            </button>
            <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
              Preview
            </button>
          </div>
        </div>
        {tab === 'write' ? (
          <textarea
            ref={textareaRef}
            id={`${ids}-body`}
            className="tq-textarea"
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            aria-invalid={Boolean(bodyError)}
            aria-describedby={`${ids}-body-hint`}
            placeholder={props.mode === 'question' ? 'What are you confused about? Markdown and ```cpp code fences work.' : 'Write a reply…'}
            spellCheck
          />
        ) : (
          <div className="tq-preview" aria-live="polite">
            {draft.body.trim() ? <Markdown source={draft.body} /> : <p className="tq-hint">Nothing to preview yet.</p>}
          </div>
        )}
        <p id={`${ids}-body-hint`} className={bodyError ? 'tq-error' : 'tq-hint tq-counter'}>
          {bodyError ?? `${length.toLocaleString('en-US')} / ${LIMITS.body.toLocaleString('en-US')}`}
        </p>
      </div>

      {props.mode === 'reply' && props.reopensOnReply && <p className="tq-hint">Replying will reopen this question.</p>}

      {status.kind === 'error' && (
        <div className="tq-aside tq-aside--danger" role="alert">
          <p>{status.message}</p>
          {status.retry && (
            <button type="submit" className="tq-button tq-button--secondary tq-button--small">
              Retry
            </button>
          )}
        </div>
      )}
      {status.kind === 'expired' && (
        <div className="tq-aside tq-aside--caution" role="alert">
          <p>Your session expired. Your draft is kept in this tab. Sign in again to submit it.</p>
          <a className="tq-button tq-button--secondary tq-button--small" href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}>
            Sign in
          </a>
        </div>
      )}

      <div className="tq-actions">
        {props.onCancel && (
          <button type="button" className="tq-button tq-button--secondary" onClick={discard}>
            {draft.body ? 'Discard' : 'Cancel'}
          </button>
        )}
        <button
          type="submit"
          className="tq-button tq-button--primary"
          aria-disabled={status.kind === 'saving' || status.kind === 'expired'}
          disabled={status.kind === 'expired'}
        >
          {status.kind === 'saving' ? 'Saving…' : props.mode === 'question' ? 'Submit question' : 'Post reply'}
        </button>
      </div>
    </form>
  );
}
