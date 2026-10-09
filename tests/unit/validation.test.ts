import { describe, expect, it } from 'vitest';
import { codePointLength, createQuestionSchema, LIMITS, sourceSchema } from '../../src/lib/validation';

const base = { requestId: '7d9f1c2e-4b6a-4c1d-9e8f-0a1b2c3d4e5f', nextSession: false, source: null };

describe('question validation', () => {
  it('accepts a general question with one body field', () => {
    expect(createQuestionSchema.safeParse({ ...base, body: 'Why?' }).success).toBe(true);
  });

  it('rejects whitespace-only bodies', () => {
    expect(createQuestionSchema.safeParse({ ...base, body: ' \n\t ' }).success).toBe(false);
  });

  it('counts code points like Postgres char_length', () => {
    expect(codePointLength('😀a')).toBe(2);
    const atLimit = '😀'.repeat(LIMITS.body);
    expect(createQuestionSchema.safeParse({ ...base, body: atLimit }).success).toBe(true);
    expect(createQuestionSchema.safeParse({ ...base, body: atLimit + 'x' }).success).toBe(false);
  });

  it('rejects unknown fields (no author/pair/recipient injection)', () => {
    expect(createQuestionSchema.safeParse({ ...base, body: 'x', authorId: 'someone' }).success).toBe(false);
    expect(createQuestionSchema.safeParse({ ...base, body: 'x', recipient: 'a@b.c' }).success).toBe(false);
  });

  it('preserves excerpt whitespace exactly', () => {
    const text = '\tint& r = a;\n\n  r = b;\n';
    const parsed = sourceSchema.parse({
      noteId: 'cpp-references-pointers',
      title: 'References and pointers',
      path: '/notes/cpp/references-and-pointers/',
      excerpt: { text, kind: 'code', language: 'cpp' },
    });
    expect(parsed.excerpt?.text).toBe(text);
  });

  it.each([
    ['javascript URL path', { path: 'javascript:alert(1)' }],
    ['absolute URL path', { path: 'https://evil.example/notes/' }],
    ['traversal', { path: '/notes/../admin' }],
    ['bad note id', { noteId: '../x' }],
    ['bad heading', { heading: 'a b"><script>' }],
    ['language on prose', { excerpt: { text: 'x', kind: 'text', language: 'cpp' } }],
    ['oversized excerpt', { excerpt: { text: 'x'.repeat(LIMITS.excerpt + 1), kind: 'text' } }],
  ])('rejects %s', (_label, override) => {
    const source = { noteId: 'n1', title: 'T', path: '/notes/a/', ...override };
    expect(sourceSchema.safeParse(source).success).toBe(false);
  });
});
