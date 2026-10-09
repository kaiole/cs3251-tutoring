import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/lib/server/cursor';

describe('cursor', () => {
  it('round-trips', () => {
    const c = { t: '2026-10-08T21:30:00.123456+00:00', id: '7d9f1c2e-4b6a-4c1d-9e8f-0a1b2c3d4e5f' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('rejects values that could inject PostgREST filter syntax', () => {
    const evil = Buffer.from(JSON.stringify(['2026-01-01T00:00:00Z),status.eq.resolved', 'x'])).toString('base64url');
    expect(decodeCursor(evil)).toBeNull();
    expect(decodeCursor('not base64!')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});
