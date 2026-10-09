import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Must match vendor/README.md. Update both together, after reviewing the new file.
const EXPECTED: Record<string, string> = {
  'vendor/tree-sitter/tree-sitter-cpp.wasm': '174eb0deb75b2ec7881bcacda9f995648d8e683956e5c2267e69ab6dc503fcbf',
  'vendor/tree-sitter/tree-sitter-c.wasm': 'c852c2a85ebf2beb636aa3b0ef7f7e70458684d74f6741b20dcb296885bed9f9',
  'vendor/nvim-treesitter/queries/c/highlights.scm': '2c473f14247cb168380627ebafe911ebc07052eb71c52950946380156be964f7',
  'vendor/nvim-treesitter/queries/cpp/highlights.scm': 'a10230678cc32f0c45eab0d3109f5bbef9fa65210efb9f0576d0a3ebacc752a8',
};

describe('vendored files', () => {
  it.each(Object.entries(EXPECTED))('%s matches its recorded sha256', (path, sha256) => {
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha256);
  });

  it('README records the same hashes', () => {
    const readme = readFileSync('vendor/README.md', 'utf8');
    for (const sha256 of Object.values(EXPECTED)) expect(readme).toContain(sha256);
  });
});
