# Product scope

Status: agreed direction, with proposed defaults called out below.

## Problem and objective

The tutor has limited time with a CS3251 student. Confusion arises during lectures and independent study, often before the next tutoring session. The student needs a low-friction way to capture questions, and the tutor needs enough context to answer efficiently or plan the next session.

The site should also make the tutor's original teaching notes publicly presentable. It is not intended to demonstrate a novel software architecture.

## Users and visibility

| User | Capabilities |
| --- | --- |
| Public visitor | Browse and search published teaching notes. No access to real questions, replies, student identities, or participation. |
| Invited student | Read notes; submit general or contextual questions; read and reply to their own tutoring threads; mark questions for the next session or resolved. |
| Tutor | Publish notes through Git; view and reply to the student's questions; manage question status; invite or revoke access through an administrative process. |

Launch with one tutor and one student. Access boundaries must still prevent a hypothetical second student from reading the first student's conversations. A public GitHub repository or organization does not grant website participation.

## Agreed first-version requirements

| ID | Requirement |
| --- | --- |
| P1 | Write notes locally in Markdown. A Git push triggers automatic publication to a custom domain. |
| P2 | Public notes have topic navigation, search, and readable C++ code examples. |
| P3 | Only invited accounts can participate. Actual student conversations are private. |
| P4 | A student can submit a general question without choosing a topic or finding an existing note. |
| P5 | A student can ask about a note, optionally selecting text and attaching a quote plus a source link. |
| P6 | General and contextual questions appear in one inbox, not separate queues. |
| P7 | Questions support replies and Markdown code blocks for asynchronous discussion. |
| P8 | Questions can be open/resolved and flagged for the next tutoring session. |
| P9 | Email notifies the tutor of new questions/student replies and the student of tutor replies. |
| P10 | Editing or moving a note must not destroy the original quoted context of existing questions. |

Topic organization is for finding notes and filtering contextual questions, not a mandatory classification step. There is no promised asynchronous response time: a question may be answered online or discussed during a session.

## Proposed v1 defaults

These are design choices to validate during implementation, not additional user commitments:

- Invite-only email magic-link login, without a public registration flow or student GitHub requirement.
- The student writes one required question field. A short inbox title is derived from its first meaningful line; no second required title field.
- Both participants can change resolved status and the next-session flag. New replies reopen resolved questions.
- No editing or deleting published messages in the UI initially. Corrections are follow-up replies; privacy/deletion requests are handled by the tutor administratively.
- Invite management uses Supabase's administrative tools initially, not a custom admin application.
- Notification emails contain a generic event description and private thread link, not student questions, code, or quoted passages.
- Ordinary Markdown is the default. MDX is optional for exceptional teaching content, never required to enable question features.

Detailed behavior is defined in [User experience](experience.md).

## Non-goals

- A learning management system, gradebook, assignment submission system, or scheduling/payment platform.
- Public discussion boards, self-service registration, group conversations, or a multi-tutor marketplace.
- Persistent highlights that automatically reattach to changing text.
- Automatic tagging, AI answers, or AI-generated classification.
- A browser-based editor/CMS for teaching notes.
- File uploads, screenshots, executable code sandboxes, or a rich-text editor.
- Real-time chat, typing indicators, push notifications, email replies, or offline synchronization.
- Automatic publication or anonymization of student conversations.
- Copying the course syllabus or lecture materials as a prerequisite for asking questions.

A later portfolio demonstration may use explicitly fictional examples. It must not expose production student data or open production question submission to visitors.

## Content and privacy boundaries

- Publish original notes and material the tutor has permission to reproduce. Link to official course resources rather than copying them wholesale.
- Keep private conversations, student code, account emails, credentials, and database exports out of Git and static build artifacts.
- A note marked `draft` is excluded from the published site, but is still public if committed to a public repository. Do not use drafts to store private material.
- With a single invited student, no public-facing notice, landing page, or marketing copy is needed (tutor's decision, 2026-10-08). Do not present the site as an official course website.
- Before inviting the student, explain who can see conversations, that managed hosting/database/email providers process necessary data, and how to request deletion.
- The tutor chooses a retention period before launch; do not silently assume permanent retention.

## What success looks like

A complete workflow is more important than traffic or feature count:

1. The tutor can add or revise a note without using a web editor.
2. The student can capture a question during lecture without selecting a topic.
3. A selected C++ excerpt reaches the tutor with meaningful whitespace and source context intact.
4. The tutor can prepare a session from the open/next-session view.
5. Either participant can continue a thread asynchronously and receive the relevant email.
6. Visitors can read notes but cannot read or create private records, including through direct API requests.
7. Notes remain readable if the database or email service is temporarily unavailable.

After the first few sessions, ask whether capture was easy, which context was missing, and whether the inbox improved preparation. Use that feedback before adding more features; no analytics platform is needed initially.
