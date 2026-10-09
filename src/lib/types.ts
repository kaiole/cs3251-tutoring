/** Shapes returned by the same-origin API to browser components. No emails or other users' ids. */

export type Role = 'student' | 'tutor';

export interface SessionInfo {
  signedIn: boolean;
  /** Present when signed in; used only to bind tab-scoped drafts to the current account. */
  userId?: string;
  /** Null when signed in without an active tutoring relationship. */
  role: Role | null;
}

export interface QuestionSourceView {
  noteId: string;
  /** Title of the note when the question was asked (snapshot, never overwritten). */
  title: string;
  heading: string | null;
  revision: string | null;
  excerpt: { text: string; kind: 'text' | 'code'; language: string | null } | null;
}

export interface InboxItem {
  id: string;
  title: string;
  status: 'open' | 'resolved';
  source: { noteId: string; title: string } | null;
  lastActivityAt: string;
  createdAt: string;
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

export interface ReplyView {
  id: string;
  body: string;
  createdAt: string;
  authorRole: Role;
  mine: boolean;
}

export interface ThreadView {
  question: {
    id: string;
    title: string;
    body: string;
    status: 'open' | 'resolved';
    version: number;
    createdAt: string;
    lastActivityAt: string;
    source: QuestionSourceView | null;
    authorRole: Role;
    mine: boolean;
  };
  replies: ReplyView[];
  nextReplyCursor: string | null;
  viewerRole: Role;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
