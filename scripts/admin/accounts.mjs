#!/usr/bin/env node
// Administrative account tooling for the tutor. Runs locally with the Supabase SECRET key; never
// deployed and never imported by the web app.
//
//   node --env-file=.env scripts/admin/accounts.mjs invite <email>
//   node --env-file=.env scripts/admin/accounts.mjs pair <tutor-email> <student-email>
//   node --env-file=.env scripts/admin/accounts.mjs revoke <student-email>
//   node --env-file=.env scripts/admin/accounts.mjs list
//
// Invitations send an email through Supabase Auth (Mailpit at http://127.0.0.1:54324 locally).
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SITE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SITE_URL) {
  console.error('SUPABASE_URL, SUPABASE_SECRET_KEY and SITE_URL must be set (use --env-file=.env).');
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUser(email) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.status}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function requireUser(email) {
  const user = await findUser(email);
  if (!user) throw new Error(`No account for ${email}. Invite it first.`);
  return user;
}

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'invite': {
      const [email] = args;
      if (!email) throw new Error('usage: invite <email>');
      // The invite template links to SITE_URL/auth/confirm (supabase/templates/invite.html).
      const { error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error) throw new Error(`invite failed: ${error.message}`);
      console.log(`Invitation sent to ${email}.`);
      break;
    }
    case 'pair': {
      const [tutorEmail, studentEmail] = args;
      if (!tutorEmail || !studentEmail) throw new Error('usage: pair <tutor-email> <student-email>');
      const tutor = await requireUser(tutorEmail);
      const student = await requireUser(studentEmail);
      const { error } = await admin
        .from('tutoring_pairs')
        .insert({ tutor_id: tutor.id, student_id: student.id });
      if (error) throw new Error(`pair failed (${error.code}). Is the student already in an active pair?`);
      console.log(`Paired tutor ${tutorEmail} with student ${studentEmail}.`);
      break;
    }
    case 'revoke': {
      const [studentEmail] = args;
      if (!studentEmail) throw new Error('usage: revoke <student-email>');
      const student = await requireUser(studentEmail);
      const { data, error } = await admin
        .from('tutoring_pairs')
        .update({ active: false })
        .eq('student_id', student.id)
        .eq('active', true)
        .select('id');
      if (error) throw new Error(`revoke failed (${error.code})`);
      console.log(`Deactivated ${data.length} pair(s). Access and pending notifications stop immediately.`);
      break;
    }
    case 'list': {
      const { data, error } = await admin.from('tutoring_pairs').select('id, tutor_id, student_id, active, created_at');
      if (error) throw new Error(`list failed (${error.code})`);
      console.table(data);
      break;
    }
    default:
      console.error('commands: invite <email> | pair <tutor-email> <student-email> | revoke <student-email> | list');
      process.exit(2);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : 'failed');
  process.exit(1);
}
