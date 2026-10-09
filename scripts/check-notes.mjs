// Fast pre-build check: every note under src/content/docs/notes has a unique, well-formed noteId.
// (The production build enforces the same rule in src/lib/notes.ts.)
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = 'src/content/docs/notes';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.mdx?$/.test(entry.name)) yield path;
  }
}

const seen = new Map();
const problems = [];
for await (const file of walk(ROOT)) {
  const text = await readFile(file, 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const id = /^noteId:\s*["']?([^"'\s]+)["']?\s*$/m.exec(frontmatter)?.[1];
  const name = relative(ROOT, file);
  if (!id) problems.push(`${name}: missing noteId`);
  else if (!ID_RE.test(id)) problems.push(`${name}: malformed noteId "${id}"`);
  else if (seen.has(id)) problems.push(`${name}: duplicate noteId "${id}" (also in ${seen.get(id)})`);
  else seen.set(id, name);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`notes: ${seen.size} notes, all noteIds unique`);
