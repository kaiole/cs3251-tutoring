import { useEffect, useState } from 'react';
import { api, ApiError, getManifest } from '../../lib/client/api';
import type { NoteManifest } from '../../lib/notes';
import type { InboxItem, InboxPage, Role } from '../../lib/types';
import { INBOX_FILTERS, NOTE_ID_RE, type InboxFilter } from '../../lib/validation';
import { relativeTime } from './time';

const FILTER_LABELS: Record<InboxFilter, string> = {
  open: 'Open',
  resolved: 'Resolved',
  all: 'All',
};

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; items: InboxItem[]; nextCursor: string | null; loadingMore: boolean }
  | { kind: 'error'; message: string };

function readParams(): { filter: InboxFilter; note: string | null } {
  const params = new URLSearchParams(location.search);
  const f = params.get('filter');
  const n = params.get('note');
  return {
    filter: (INBOX_FILTERS as readonly string[]).includes(f ?? '') ? (f as InboxFilter) : 'open',
    note: n && NOTE_ID_RE.test(n) ? n : null,
  };
}

function hrefFor(filter: InboxFilter, note: string | null): string {
  const params = new URLSearchParams();
  if (filter !== 'open') params.set('filter', filter);
  if (note) params.set('note', note);
  const q = params.toString();
  return q ? `/questions?${q}` : '/questions';
}

export default function Inbox({ role }: { role: Role }) {
  const [{ filter, note }] = useState(readParams);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [manifest, setManifest] = useState<NoteManifest | null>(null);

  async function fetchPage(cursor: string | null) {
    const params = new URLSearchParams({ filter });
    if (note) params.set('note', note);
    if (cursor) params.set('cursor', cursor);
    return api<InboxPage>(`/api/questions?${params}`);
  }

  async function reload() {
    setLoad({ kind: 'loading' });
    try {
      const page = await fetchPage(null);
      setLoad({ kind: 'ready', items: page.items, nextCursor: page.nextCursor, loadingMore: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      setLoad({ kind: 'error', message: 'Questions are temporarily unavailable.' });
    }
  }

  useEffect(() => {
    void reload();
    void getManifest().then(setManifest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (load.kind !== 'ready' || !load.nextCursor) return;
    setLoad({ ...load, loadingMore: true });
    try {
      const page = await fetchPage(load.nextCursor);
      setLoad({ kind: 'ready', items: [...load.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false });
    } catch {
      setLoad({ ...load, loadingMore: false });
    }
  }

  const noteOptions = manifest ? Object.entries(manifest.notes).sort((a, b) => a[1].title.localeCompare(b[1].title)) : [];

  return (
    <div className="tq-inbox">
      <div className="tq-inbox__head">
        {role === 'student' && (
          <a className="tq-button tq-button--primary" href="/questions/new">
            Ask a question
          </a>
        )}
      </div>

      <div className="tq-inbox__bar">
        <nav aria-label="Filter questions" className="tq-filter-tabs">
          {INBOX_FILTERS.map((f) => (
            <a key={f} href={hrefFor(f, note)} aria-current={f === filter ? 'page' : undefined}>
              {FILTER_LABELS[f]}
            </a>
          ))}
        </nav>
        <label>
          <span className="sr-only">Source note</span>
          <select
            className="tq-input tq-select"
            value={note ?? ''}
            onChange={(e) => location.assign(hrefFor(filter, e.target.value || null))}
          >
            <option value="">All notes and general questions</option>
            {noteOptions.map(([id, n]) => (
              <option key={id} value={id}>
                {n.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {load.kind === 'loading' && (
        <p className="tq-hint" aria-busy="true">
          Loading questions…
        </p>
      )}
      {load.kind === 'error' && (
        <div className="tq-aside tq-aside--caution" role="alert">
          <p>
            <strong>{load.message}</strong>
          </p>
          <p>Notes are still readable. Your questions are safe; try again in a moment.</p>
          <button type="button" className="tq-button tq-button--secondary tq-button--small" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}
      {load.kind === 'ready' && load.items.length === 0 && <EmptyState role={role} filter={filter} />}
      {load.kind === 'ready' && load.items.length > 0 && (
        <>
          <ol className="tq-rows">
            {load.items.map((item) => (
              <li key={item.id}>
                <a href={`/questions/${item.id}`} className="tq-row">
                  <span className="tq-row__main">
                    <span className="tq-row__title">{item.title}</span>
                    <span className="tq-row__source">
                      <SourceLabel item={item} manifest={manifest} />
                    </span>
                  </span>
                  <span className="tq-row__aside">
                    {filter === 'all' && (
                      <span className="tq-row__status">{item.status === 'open' ? 'Open' : 'Resolved'}</span>
                    )}
                    <time dateTime={item.lastActivityAt} title={new Date(item.lastActivityAt).toLocaleString()}>
                      {relativeTime(item.lastActivityAt)}
                    </time>
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {load.nextCursor && (
            <button
              type="button"
              className="tq-button tq-button--secondary"
              onClick={() => void loadMore()}
              aria-disabled={load.loadingMore}
            >
              {load.loadingMore ? 'Loading…' : 'Load older questions'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function SourceLabel({ item, manifest }: { item: InboxItem; manifest: NoteManifest | null }) {
  if (!item.source) return <span>General question</span>;
  const current = manifest?.notes[item.source.noteId];
  if (manifest && !current) return <em>Source note unavailable</em>;
  return <span>{current?.title ?? item.source.title}</span>;
}

function EmptyState({ role, filter }: { role: Role; filter: InboxFilter }) {
  const heading =
    filter === 'resolved' ? 'No resolved questions yet' : filter === 'all' ? 'No questions yet' : 'No open questions';
  return (
    <div className="tq-empty">
      <p className="tq-empty__title">{heading}</p>
      {role === 'student' && filter !== 'resolved' && (
        <a className="tq-button tq-button--primary" href="/questions/new">
          Ask a question
        </a>
      )}
    </div>
  );
}
