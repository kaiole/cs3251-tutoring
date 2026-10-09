/**
 * Input rules shared by the browser and the server. They mirror the database CHECK constraints in
 * supabase/migrations so users get early, friendly errors; the database remains the authority.
 */
import { z } from 'zod';

export const LIMITS = {
  body: 20_000,
  excerpt: 5_000,
  title: 120,
  sourceTitle: 200,
  sourcePath: 300,
} as const;

/** Length in Unicode code points — what Postgres char_length() counts. */
export function codePointLength(value: string): number {
  let n = 0;
  for (const _ of value) n++;
  return n;
}

export const NOTE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const NOTE_PATH_RE = /^\/notes\/[A-Za-z0-9/_.-]*$/;
export const HEADING_RE = /^[A-Za-z0-9_-]{1,100}$/;
export const REVISION_RE = /^[A-Za-z0-9._-]{1,64}$/;
export const LANGUAGE_RE = /^[A-Za-z0-9+#_-]{1,32}$/;

const notBlank = (value: string) => /\S/.test(value);

export const bodySchema = z
  .string()
  .refine(notBlank, 'Write something before sending.')
  .refine((v) => codePointLength(v) <= LIMITS.body, `Keep it under ${LIMITS.body.toLocaleString('en-US')} characters.`);

export const excerptSchema = z
  .strictObject({
    // Never trimmed: code indentation and blank lines are meaningful.
    text: z
      .string()
      .refine(notBlank, 'The quote is empty.')
      .refine(
        (v) => codePointLength(v) <= LIMITS.excerpt,
        `That selection is too long (over ${LIMITS.excerpt.toLocaleString('en-US')} characters). Select a smaller excerpt.`,
      ),
    kind: z.enum(['text', 'code']),
    language: z.string().regex(LANGUAGE_RE).optional(),
  })
  .refine((e) => e.language === undefined || e.kind === 'code', 'Only code excerpts have a language.');

export const sourceSchema = z.strictObject({
  noteId: z.string().regex(NOTE_ID_RE),
  title: z.string().min(1).refine((v) => codePointLength(v) <= LIMITS.sourceTitle),
  path: z
    .string()
    .max(LIMITS.sourcePath)
    .regex(NOTE_PATH_RE)
    .refine((v) => !v.includes('..')),
  heading: z.string().regex(HEADING_RE).optional(),
  revision: z.string().regex(REVISION_RE).optional(),
  excerpt: excerptSchema.optional(),
});
export type QuestionSource = z.infer<typeof sourceSchema>;

export const createQuestionSchema = z.strictObject({
  requestId: z.uuid(),
  body: bodySchema,
  source: sourceSchema.nullable(),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const createReplySchema = z.strictObject({
  requestId: z.uuid(),
  body: bodySchema,
});

export const LIFECYCLE_ACTIONS = ['resolve', 'reopen'] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export const updateStateSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
  action: z.enum(LIFECYCLE_ACTIONS),
});

export const INBOX_FILTERS = ['open', 'resolved', 'all'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const loginSchema = z.strictObject({
  email: z.email().max(254),
  next: z.string().max(500).optional(),
});
