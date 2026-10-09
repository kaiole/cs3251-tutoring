import type { Role, SessionInfo } from '../types';
import type { Supabase } from './supabase';

export interface Viewer {
  userId: string;
  role: Role | null;
}

/**
 * Resolve the signed-in user. Uses auth.getUser(), which validates the session with the Auth
 * server on every call (never trust getSession()/cookie contents alone). Returns null when signed
 * out or when the session is invalid/revoked.
 */
export async function getViewer(supabase: Supabase): Promise<Viewer | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const userId = data.user.id;

  // RLS returns only active pairs the user belongs to.
  const { data: pairs, error: pairError } = await supabase
    .from('tutoring_pairs')
    .select('tutor_id, student_id')
    .limit(50);
  if (pairError) throw new Error('pair lookup failed');

  let role: Role | null = null;
  if (pairs.some((p) => p.student_id === userId)) role = 'student';
  else if (pairs.some((p) => p.tutor_id === userId)) role = 'tutor';
  return { userId, role };
}

export function toSessionInfo(viewer: Viewer | null): SessionInfo {
  return viewer ? { signedIn: true, userId: viewer.userId, role: viewer.role } : { signedIn: false, role: null };
}
