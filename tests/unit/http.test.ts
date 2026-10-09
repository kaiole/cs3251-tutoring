import { describe, expect, it } from 'vitest';
import { HttpError, MAX_JSON_BYTES, readJson } from '../../src/lib/server/http';

const req = (body: string, type = 'application/json') =>
  new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': type }, body });

describe('readJson', () => {
  it('parses JSON', async () => {
    await expect(readJson(req('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it('rejects non-JSON content types (form CSRF)', async () => {
    await expect(readJson(req('a=1', 'application/x-www-form-urlencoded'))).rejects.toMatchObject({ status: 415 });
    await expect(readJson(req('{}', 'text/plain'))).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects oversized bodies even without a content-length', async () => {
    const big = JSON.stringify({ body: 'x'.repeat(MAX_JSON_BYTES) });
    await expect(readJson(req(big))).rejects.toMatchObject({ status: 413 });
  });
});
