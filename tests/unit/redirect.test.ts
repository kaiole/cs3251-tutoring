import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, safeNextPath } from '../../src/lib/server/redirect';

describe('safeNextPath', () => {
  it.each(['/questions', '/questions/123?x=1#y', '/notes/cpp/refs/'])('allows %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    'https://evil.example/questions',
    '//evil.example/questions',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/questions\n/x',
    '/api/questions',
    '/auth/confirm',
    '',
    undefined,
    42,
  ])('rejects %s', (path) => {
    expect(safeNextPath(path)).toBe(DEFAULT_AFTER_LOGIN);
  });
});
