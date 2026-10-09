# User experience

Status: v1 interaction design implementing [Product scope](product.md); implemented and tested locally (see [implementation status](implementation.md#6-implementation-status)). Visual design: [Claude Design mockups](https://claude.ai/artifact/522KJSdQcG1eJtbh7osKJv), built on Starlight's tokens.

## Pages and navigation

| Route | Visibility | Purpose |
| --- | --- | --- |
| `/` | Public | Plain list of notes. |
| `/notes/...` | Public | Starlight topic navigation, article, table of contents, search, and question entry points. |
| `/login` | Public form | Sign in to an existing invited account; no registration. |
| `/auth/confirm` | Emailed link target | One-click “Continue signing in” (POST) so email scanners cannot consume one-time links. |
| `/questions` | Authenticated participant | Unified inbox; empty state includes “Ask a question.” |
| `/questions/new` | Authenticated student | Full-page version of the question composer, including a general-question entry point. |
| `/questions/[id]` | Authorized participants only | Original question, saved context, replies, and lifecycle controls. |

Use “Questions” and “Sign in”/“Sign out” in the site header. Public pages must not contain another visitor's session state or private counts in their generated HTML. The tutor's primary workspace is the inbox, not a separate dashboard.

## 1. Publishing notes

1. Write a `.md` file locally, adding a title, stable note identifier, and optional topic metadata.
2. Preview locally using the site's eventual development command.
3. Push to the publication branch. Checks and the production build must succeed before the new deployment replaces the previous one.
4. The resulting page appears in topic navigation and public search.

Start with original notes for current tutoring needs, not empty pages for every item in a speculative syllabus.

## 2. Capturing a general question

1. From Questions, choose “Ask a question.”
2. Enter the question in a Markdown textarea. Code fences are supported; provide a preview.
3. Optionally flag “Cover next session.” Do not require a category, note, or separate title.
4. Submit and navigate to the new thread. Clear the draft only after the server confirms it was saved.

The student can keep this page open during lecture. There is no requirement to have read a note first.

## 3. Asking about a note

An “Ask about this note” button opens the same composer with a source attachment already present. The attachment displays the note title and offers “Remove context,” converting it to a general question.

Public visitors see notes only; the header has a Sign in link. Do not present a registration path. Signed-in tutors see a link to questions about the note instead of question-creation controls.

## 4. Highlight → Ask

1. The student selects text inside the article content, excluding navigation, buttons, and discussion UI.
2. A small “Ask about this” action appears near the selection. Selecting text must not interfere with ordinary copy behavior.
3. Activating it snapshots the selection and opens the composer without losing the quote when focus changes.
4. Show a read-only quote preview and note/section attribution above the question field.
5. The student writes the question, then submits to the same inbox as every other question.

Example:

> From: References and pointers → Reference assignment
>
> “A reference cannot be reseated after initialization.”
>
> Question: What happens if I assign a different variable to it?

### Selection rules

- Preserve selected code indentation, tabs, blank lines, and line breaks. Do not normalize code whitespace with a generic trim operation.
- A selection entirely within one code block is rendered as code; retain its language when available. Mixed prose/code selections use a whitespace-preserving plain-text excerpt.
- Store text, not arbitrary selected HTML. Syntax-highlighting spans and copy controls are not part of the quote.
- Record the nearest preceding heading at the start of the selection when available. A selection spanning sections still has one source link.
- The quote is a snapshot, not a permanently highlighted range. Do not build text reattachment or revision comparison.
- A persistent “Ask about this note” button and manually pasted excerpt are fallbacks when selection UI is unavailable. Pasted text is explicitly user-supplied, not a verified quotation.
- No silent truncation. If a selection exceeds the limit, ask the student to select a smaller excerpt.

### After a note changes

Resolve the saved stable note ID to its current URL. If the original heading still exists, link there; otherwise link to the note. If the note was removed, show “Source note unavailable” and retain the original title and quote. Never overwrite the saved excerpt with current note content.

## 5. Inbox

One list contains general questions and questions attached to notes.

- Default filter: open questions, most recently active first.
- Additional filters: next session, resolved, all, and source note. No mandatory tags.
- “Next session” shows open, flagged questions, ordered oldest first so earlier questions are not forgotten.
- Each row shows a derived short title, optional source note, state, next-session flag, and last activity time.
- A student's inbox contains only their tutoring conversations. A tutor sees conversations for their active tutoring relationships.
- Paginate rather than fetching every question and reply at once. Full-text question search and unread counters are not required for v1.

## 6. Thread and lifecycle

Display the original question and source attachment first, followed by replies in chronological order. Both participants can post Markdown replies. Use role labels such as “You,” “Student,” and “Tutor”; do not unnecessarily display account emails.

| Event | Result |
| --- | --- |
| Student submits a question | Open; next-session flag follows the form choice; notify tutor. |
| Either participant adds a reply | Append the reply; if resolved, reopen atomically; notify the other participant. |
| Either participant resolves | Mark resolved and clear the next-session flag. No notification. |
| Either participant reopens | Mark open. Do not automatically restore the next-session flag. |
| Either participant flags for next session | Ensure open and set the flag. No notification. |
| Either participant removes next-session flag | Clear the flag; keep the current open/resolved state. |

An answer does not automatically resolve a question: the student may still be confused. After an in-person discussion, the tutor can add a short summary or link to an explanatory note before resolving it.

For v1, original questions, quote snapshots, and posted replies are immutable through the normal UI. Follow-up corrections preserve a clear history. Administrative deletion remains possible for privacy requests.

## 7. Login, drafts, and failure states

- Sign-in sends an email only through the configured authentication service. Use a generic response that does not confirm whether a submitted address belongs to a student.
- Return to a validated same-origin destination after login. An expired or reused login link offers a fresh sign-in attempt.
- A session expiring mid-composition must not discard the draft. Preserve it in tab-scoped storage, then offer reauthentication.
- Draft storage is not an offline feature or permanent backup. Bind authenticated drafts to the current user and clear them on submit, explicit discard, logout, or expiration. Never restore one user's draft into another user's account.
- If a request fails or times out, keep the draft and provide retry. Use the same submission identifier when retrying an unchanged submission so the server does not create duplicates.
- If a saved question's email is delayed, the thread still exists. The success message is “Question saved,” not a promise that email was delivered.
- Show useful empty, loading, unavailable, validation, and permission-denied states. An inaccessible thread must not disclose its title or author.

## Accessibility and initial limits

- UI copy is minimal: labels and error messages only, no explanatory or promotional text.
- The UI is monochrome with square corners (lackluster grays), in dark and light themes. The one exception is string literals in code, which use the palette's muted red. C/C++ code is highlighted like the tutor's Neovim (tree-sitter), and code blocks sit on a framed surface. States are conveyed by text labels, weight and borders, never colour alone, and text keeps ≥ 4.5:1 contrast in both themes.
- Keyboard users can reach every action; the composer has labeled fields, visible focus, Escape-to-close where appropriate, and focus restoration to its trigger.
- Highlighting is optional, never the only route to asking a contextual question. Validate selection behavior with mouse, keyboard, and mobile touch.
- Retain Starlight's reading layout and responsive behavior. Reuse its visual tokens for custom UI instead of adding a second design system.
- Enforce the same limits in the browser and on the server/database: question/reply body 20,000 characters; excerpt 5,000 characters; derived title at most 120 characters. Reject whitespace-only bodies.
- These limits are initial safeguards, not learning requirements. Increase deliberately if real usage justifies it.
