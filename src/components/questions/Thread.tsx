import { useEffect, useState } from 'react';
import { api, ApiError, getManifest, resolveSourceLink } from '../../lib/client/api';
import type { NoteManifest } from '../../lib/notes';
import type { QuestionSourceView, ReplyView, Role, ThreadView } from '../../lib/types';
import type { LifecycleAction } from '../../lib/validation';
import Composer from './Composer';
import Markdown from './Markdown';
import { absoluteDate, relativeTime } from './time';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; thread: ThreadView }
  | { kind: 'not_found' }
  | { kind: 'error' };

function roleLabel(role: Role, mine: boolean): string {
  if (mine) return 'You';
  return role === 'tutor' ? 'Tutor' : 'Student';
}

export default function Thread({ questionId, userId }: { questionId: string; userId: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [manifest, setManifest] = useState<NoteManifest | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function reload() {
    try {
      const thread = await api<ThreadView>(`/api/questions/${questionId}`);
      setLoad({ kind: 'ready', thread });
      setStale(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        location.assign(`/login?next=${encodeURIComponent(location.pathname)}`);
      } else if (err instanceof ApiError && err.status === 404) {
        setLoad({ kind: 'not_found' });
      } else {
        setLoad({ kind: 'error' });
      }
    }
  }

  useEffect(() => {
    void reload();
    void getManifest().then(setManifest);
    const params = new URLSearchParams(location.search);
    if (params.get('saved') === '1') {
      setToast('Question saved');
      history.replaceState(null, '', location.pathname);
      window.setTimeout(() => setToast(null), 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  async function act(action: LifecycleAction) {
    if (load.kind !== 'ready') return;
    setBusy(true);
    setActionError(null);
    try {
      await api(`/api/questions/${questionId}`, {
        method: 'PATCH',
        body: { expectedVersion: load.thread.question.version, action },
      });
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStale(true);
      else setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (load.kind === 'loading') {
    return (
      <p className="tq-hint" aria-busy="true">
        Loading question…
      </p>
    );
  }
  if (load.kind === 'not_found') {
    return (
      <div className="tq-empty">
        <p className="tq-empty__title">Question not available</p>
        <p>This question doesn't exist or you don't have access.</p>
        <a className="tq-button tq-button--secondary" href="/questions">
          Back to Questions
        </a>
      </div>
    );
  }
  if (load.kind === 'error') {
    return (
      <div className="tq-aside tq-aside--caution" role="alert">
        <p>
          <strong>Questions are temporarily unavailable.</strong>
        </p>
        <p>Notes are still readable. Try again in a moment.</p>
        <button type="button" className="tq-button tq-button--secondary tq-button--small" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  }

  const { question, replies } = load.thread;
  const resolved = question.status === 'resolved';

  return (
    <article className="tq-thread">
      <a className="tq-back" href="/questions">
        ← Questions
      </a>

      {stale && (
        <div className="tq-aside tq-aside--caution" role="status">
          <p>
            <strong>This question changed — refresh to see the new reply.</strong> Your change wasn't applied.
          </p>
          <button type="button" className="tq-button tq-button--secondary tq-button--small" onClick={() => void reload()}>
            Refresh
          </button>
        </div>
      )}

      <header className="tq-thread__head">
        <p className="tq-thread__status">{resolved ? 'Resolved' : 'Open'}</p>
        <h2 className="tq-thread__title">{question.title}</h2>
        <p className="tq-hint">
          Asked by {roleLabel(question.authorRole, question.mine)} ·{' '}
          <time dateTime={question.createdAt}>{absoluteDate(question.createdAt)}</time>
        </p>
      </header>

      <div className="tq-lifecycle" role="group" aria-label="Question status">
        {resolved ? (
          <button type="button" className="tq-button tq-button--secondary tq-button--small" disabled={busy} onClick={() => void act('reopen')}>
            Reopen
          </button>
        ) : (
          <button type="button" className="tq-button tq-button--secondary tq-button--small" disabled={busy} onClick={() => void act('resolve')}>
            Resolve
          </button>
        )}
        {actionError && <p className="tq-error">{actionError}</p>}
      </div>

      <Message
        role={question.authorRole}
        mine={question.mine}
        createdAt={question.createdAt}
        body={question.body}
        source={question.source}
        manifest={manifest}
      />
      {replies.map((r: ReplyView) => (
        <Message key={r.id} role={r.authorRole} mine={r.mine} createdAt={r.createdAt} body={r.body} />
      ))}
      {load.thread.nextReplyCursor && <p className="tq-hint">Older replies are not shown. (Over 100 replies.)</p>}

      <section className="tq-reply" aria-labelledby="tq-reply-title">
        <h2 id="tq-reply-title">Add a reply</h2>
        <Composer
          mode="reply"
          questionId={question.id}
          userId={userId}
          draftScope={`reply:${question.id}`}
          reopensOnReply={resolved}
          onSaved={() => void reload()}
        />
      </section>

      {toast && (
        <div className="tq-toast" role="status">
          {toast}
        </div>
      )}
    </article>
  );
}

function Message(props: {
  role: Role;
  mine: boolean;
  createdAt: string;
  body: string;
  source?: QuestionSourceView | null;
  manifest?: NoteManifest | null;
}) {
  return (
    <section className="tq-message">
      <header className="tq-message__head">
        <strong>{roleLabel(props.role, props.mine)}</strong>
        <time dateTime={props.createdAt} title={new Date(props.createdAt).toLocaleString()}>
          {relativeTime(props.createdAt)}
        </time>
      </header>
      <div className="tq-message__body">
        {props.source && <SourceBlock source={props.source} manifest={props.manifest ?? null} />}
        <Markdown source={props.body} />
      </div>
    </section>
  );
}

function SourceBlock({ source, manifest }: { source: QuestionSourceView; manifest: NoteManifest | null }) {
  const link = resolveSourceLink(manifest, source.noteId, source.heading);
  return (
    <div className="tq-source">
      <p className="tq-source-card">
        <span className="tq-source-card__label">From</span>
        {link ? (
          <a href={link.url}>{link.title}</a>
        ) : manifest ? (
          <span>
            <em>Source note unavailable</em> · Originally “{source.title}”
          </span>
        ) : (
          <span>{source.title}</span>
        )}
      </p>
      {source.excerpt && (
        <figure className="tq-quote">
          {source.excerpt.language && (
            <figcaption>
              <span className="tq-badge tq-badge--neutral">{source.excerpt.language}</span>
            </figcaption>
          )}
          {source.excerpt.kind === 'code' ? (
            <pre tabIndex={0}>
              <code>{source.excerpt.text}</code>
            </pre>
          ) : (
            <blockquote>{source.excerpt.text}</blockquote>
          )}
        </figure>
      )}
    </div>
  );
}
