/**
 * Question/reply operations. All calls use the caller's user-scoped client, so RLS and the
 * SECURITY DEFINER RPCs (supabase/migrations) make every authorization decision.
 */
import type { InboxFilter, CreateQuestionInput, LifecycleAction } from '../validation';
import type { InboxItem, InboxPage, ReplyView, Role, ThreadView } from '../types';
import type { Tables } from '../database.types';
import { decodeCursor, encodeCursor } from './cursor';
import type { Supabase } from './supabase';

export const INBOX_PAGE_SIZE = 25;
export const REPLY_PAGE_SIZE = 100;

const INBOX_COLUMNS =
  'id, title, status, next_session, source_note_id, source_title, last_activity_at, created_at' as const;
const THREAD_COLUMNS =
  'id, pair_id, author_id, title, body_md, status, next_session, version, created_at, last_activity_at, ' +
  'source_note_id, source_title, source_heading, source_revision, excerpt_text, excerpt_kind, excerpt_language';

type DbError = { code?: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: DbError };

type InboxRow = Pick<
  Tables<'questions'>,
  'id' | 'title' | 'status' | 'next_session' | 'source_note_id' | 'source_title' | 'last_activity_at' | 'created_at'
>;

function toInboxItem(row: InboxRow): InboxItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status as InboxItem['status'],
    nextSession: row.next_session,
    source: row.source_note_id ? { noteId: row.source_note_id, title: row.source_title ?? '' } : null,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
  };
}

export async function listQuestions(
  supabase: Supabase,
  opts: { filter: InboxFilter; noteId?: string | undefined; cursor?: string | null | undefined },
): Promise<Result<InboxPage>> {
  // "Next session": open + flagged, oldest first so earlier questions are not forgotten.
  const oldestFirst = opts.filter === 'next';
  const sortColumn = oldestFirst ? 'created_at' : 'last_activity_at';

  let query = supabase.from('questions').select(INBOX_COLUMNS);
  if (opts.filter === 'open') query = query.eq('status', 'open');
  if (opts.filter === 'resolved') query = query.eq('status', 'resolved');
  if (opts.filter === 'next') query = query.eq('status', 'open').eq('next_session', true);
  if (opts.noteId) query = query.eq('source_note_id', opts.noteId);

  const cursor = decodeCursor(opts.cursor);
  if (cursor) {
    // Safe to interpolate: decodeCursor only admits a strict timestamp and a UUID.
    const op = oldestFirst ? 'gt' : 'lt';
    query = query.or(
      `${sortColumn}.${op}."${cursor.t}",and(${sortColumn}.eq."${cursor.t}",id.${op}.${cursor.id})`,
    );
  }

  const { data, error } = await query
    .order(sortColumn, { ascending: oldestFirst })
    .order('id', { ascending: oldestFirst })
    .limit(INBOX_PAGE_SIZE + 1);
  if (error) return { ok: false, error };

  const rows = data.slice(0, INBOX_PAGE_SIZE);
  const last = rows.at(-1);
  const nextCursor =
    data.length > INBOX_PAGE_SIZE && last
      ? encodeCursor({ t: oldestFirst ? last.created_at : last.last_activity_at, id: last.id })
      : null;
  return { ok: true, value: { items: rows.map(toInboxItem), nextCursor } };
}

/** Returns null (→ non-disclosing 404) when the question is missing or not visible to the caller. */
export async function getThread(
  supabase: Supabase,
  viewerId: string,
  questionId: string,
  replyCursor?: string | null,
): Promise<Result<ThreadView | null>> {
  const { data: q, error } = await supabase
    .from('questions')
    .select(THREAD_COLUMNS)
    .eq('id', questionId)
    .maybeSingle<Tables<'questions'>>();
  if (error) return { ok: false, error };
  if (!q) return { ok: true, value: null };

  const { data: pair, error: pairError } = await supabase
    .from('tutoring_pairs')
    .select('tutor_id, student_id')
    .eq('id', q.pair_id)
    .maybeSingle();
  if (pairError) return { ok: false, error: pairError };
  if (!pair) return { ok: true, value: null };

  const roleOf = (userId: string): Role => (userId === pair.tutor_id ? 'tutor' : 'student');

  let replyQuery = supabase
    .from('replies')
    .select('id, author_id, body_md, created_at')
    .eq('question_id', q.id);
  const cursor = decodeCursor(replyCursor);
  if (cursor) {
    replyQuery = replyQuery.or(
      `created_at.gt."${cursor.t}",and(created_at.eq."${cursor.t}",id.gt.${cursor.id})`,
    );
  }
  const { data: replies, error: replyError } = await replyQuery
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(REPLY_PAGE_SIZE + 1);
  if (replyError) return { ok: false, error: replyError };

  const page = replies.slice(0, REPLY_PAGE_SIZE);
  const lastReply = page.at(-1);
  const replyViews: ReplyView[] = page.map((r) => ({
    id: r.id,
    body: r.body_md,
    createdAt: r.created_at,
    authorRole: roleOf(r.author_id),
    mine: r.author_id === viewerId,
  }));

  return {
    ok: true,
    value: {
      question: {
        id: q.id,
        title: q.title,
        body: q.body_md,
        status: q.status as 'open' | 'resolved',
        nextSession: q.next_session,
        version: q.version,
        createdAt: q.created_at,
        lastActivityAt: q.last_activity_at,
        authorRole: roleOf(q.author_id),
        mine: q.author_id === viewerId,
        source: q.source_note_id
          ? {
              noteId: q.source_note_id,
              title: q.source_title ?? '',
              heading: q.source_heading,
              revision: q.source_revision,
              excerpt: q.excerpt_text
                ? {
                    text: q.excerpt_text,
                    kind: q.excerpt_kind === 'code' ? 'code' : 'text',
                    language: q.excerpt_language,
                  }
                : null,
            }
          : null,
      },
      replies: replyViews,
      nextReplyCursor:
        replies.length > REPLY_PAGE_SIZE && lastReply
          ? encodeCursor({ t: lastReply.created_at, id: lastReply.id })
          : null,
      viewerRole: roleOf(viewerId),
    },
  };
}

export async function createQuestion(
  supabase: Supabase,
  input: CreateQuestionInput,
): Promise<Result<{ id: string }>> {
  const { data, error } = await supabase.rpc('create_question', {
      p_request_id: input.requestId,
      p_body: input.body,
      p_next_session: input.nextSession,
      // Passed through exactly as validated so identical retries hash identically.
      ...(input.source ? { p_source: input.source } : {}),
    });
  if (error) return { ok: false, error };
  return { ok: true, value: { id: data.id } };
}

export async function addReply(
  supabase: Supabase,
  questionId: string,
  input: { requestId: string; body: string },
): Promise<Result<{ id: string; question: { status: string; version: number } }>> {
  const { data, error } = await supabase.rpc('add_reply', {
    p_question_id: questionId,
    p_request_id: input.requestId,
    p_body: input.body,
  });
  if (error) return { ok: false, error };
  const result = data as { reply: { id: string }; question: { status: string; version: number } };
  return { ok: true, value: { id: result.reply.id, question: result.question } };
}

export async function setQuestionState(
  supabase: Supabase,
  questionId: string,
  expectedVersion: number,
  action: LifecycleAction,
): Promise<Result<{ status: string; nextSession: boolean; version: number }>> {
  const { data, error } = await supabase.rpc('set_question_state', {
      p_question_id: questionId,
      p_expected_version: expectedVersion,
      p_action: action,
    });
  if (error) return { ok: false, error };
  return { ok: true, value: { status: data.status, nextSession: data.next_session, version: data.version } };
}
