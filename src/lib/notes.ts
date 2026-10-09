/**
 * Public note manifest: stable noteId → current title, URL, topic and heading anchors.
 * Built from published notes only; contains no account or conversation data.
 */
import { getCollection, render } from 'astro:content';

export interface ManifestNote {
  title: string;
  url: string;
  topic: string | null;
  headings: string[];
}
export interface NoteManifest {
  revision: string;
  notes: Record<string, ManifestNote>;
}

export const NOTES_PREFIX = 'notes/';

/** Throws (failing the build) on a missing or duplicate noteId. */
export async function buildNoteManifest(): Promise<NoteManifest> {
  const entries = await getCollection(
    'docs',
    (e) => e.id.startsWith(NOTES_PREFIX) && !(import.meta.env.PROD && e.data.draft),
  );
  const notes: Record<string, ManifestNote> = {};
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const noteId = entry.data.noteId;
    if (!noteId) {
      throw new Error(`Note "${entry.id}" is missing a noteId in its frontmatter.`);
    }
    const previous = seen.get(noteId);
    if (previous) {
      throw new Error(`Duplicate noteId "${noteId}" in "${previous}" and "${entry.id}".`);
    }
    seen.set(noteId, entry.id);
    const { headings } = await render(entry);
    notes[noteId] = {
      title: entry.data.title,
      url: `/${entry.id}/`,
      topic: entry.data.topic ?? null,
      headings: headings.map((h) => h.slug),
    };
  }
  return { revision: import.meta.env.BUILD_REVISION, notes };
}
