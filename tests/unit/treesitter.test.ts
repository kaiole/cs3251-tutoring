import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roleForCapture, ROLES } from '../../src/lib/highlight/roles.mjs';
import { highlightCode, luaPatternToRegExp, rolesPerChar } from '../../src/lib/highlight/treesitter.mjs';

/** Role of the first occurrence of `token` (after `after`, if given) in `code`. */
async function roleOf(code: string, token: string, after = '') {
  const roles = await rolesPerChar(code, 'cpp');
  const index = code.indexOf(token, after ? code.indexOf(after) : 0);
  return roles[index] ?? 'plain';
}

describe('tree-sitter highlighter (nvim parity)', () => {
  it('matches the tutor’s Neovim on every character of the fixture', async () => {
    // Golden file produced by scripts/dev/nvim-captures.lua from the real Neovim setup.
    const code = readFileSync('tests/fixtures/highlight.cpp', 'utf8').replace(/\n$/, '');
    const nvim: string[][] = JSON.parse(readFileSync('tests/fixtures/highlight.cpp.nvim.json', 'utf8'));
    const ours = await rolesPerChar(code, 'cpp');
    const mismatches: string[] = [];
    let offset = 0;
    code.split('\n').forEach((text, line) => {
      for (let col = 0; col < text.length; col++) {
        if (/\s/.test(text[col] ?? '')) continue;
        const capture = nvim[line]?.[col] ?? '';
        const want = (capture && roleForCapture(capture)) || 'plain';
        const got = ours[offset + col] ?? 'plain';
        if (want !== got) mismatches.push(`${line + 1}:${col + 1} nvim=@${capture}(${want}) ours=${got}`);
      }
      offset += text.length + 1;
    });
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['return x;', 'return', 'ret'],
    ['throw 1;', 'throw', 'ret'],
    ['const int x = 1;', 'const', 'keyword'],
    ['int f() { return 0; }', 'f', 'keyword'], // function definitions are bold via @function → @keyword
    ['int x = foo();', 'foo', 'name'],
    ['int x = 1;', 'int', 'name'],
    ['auto s = "hi\\n";', '"hi', 'string'],
    ['char c = \'x\';', "'x'", 'string'],
    ['// note', '//', 'comment'],
    ['struct P { int x; };', 'x', 'variable'], // field declaration → @variable.member
    ['int y = p.x;', '.x', 'variable'], // the dot is punctuation…
    ['int y = p.field;', 'field', 'property'], // …and a field access is @property
    ['int x = a + b;', '+', 'variable'],
  ])('%s → %s is %s', async (code, token, role) => {
    expect(await roleOf(code, token)).toBe(role);
  });

  it('applies #lua-match? (macro-style constants) and inner-over-outer precedence', async () => {
    expect(await roleOf('int y = MAX_SIZE;', 'MAX_SIZE')).toBe('name'); // @constant via ^[A-Z][A-Z0-9_]+$
    expect(await roleOf('int y = lower_case;', 'lower_case')).toBe('variable');
    // The call's identifier is an inner node of call_expression and wins over outer captures.
    expect(await roleOf('x = obj.method();', 'method')).toBe('name'); // @function.method.call
  });

  it('returns sorted, non-overlapping ranges', async () => {
    const ranges = await highlightCode('int main() { return 0; }', 'cpp');
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.start).toBeGreaterThanOrEqual(ranges[i - 1]!.end);
    }
  });

  it('highlights C with the C grammar', async () => {
    const roles = await rolesPerChar('int main(void) { return 0; }', 'c');
    expect(roles['int main(void) { '.length]).toBe('ret');
  });
});

describe('lua pattern translation', () => {
  it.each([
    ['^m_.*$', 'm_count', true],
    ['^m_.*$', 'count', false],
    ['^[%u]', 'Point', true],
    ['^%u', 'point', false],
    ['^[A-Z][A-Z0-9_]+$', 'MAX_SIZE', true],
    ['^__builtin_', '__builtin_expect', true],
    ['^/[*][*][^*].*[*]/$', '/** doc */', true],
    ['^/[*][*][^*].*[*]/$', '/*** no */', false],
  ])('%s on %s → %s', (pattern, text, expected) => {
    expect(luaPatternToRegExp(pattern).test(text)).toBe(expected);
  });
});

describe('code colours', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it.each(Object.entries(ROLES))('%s meets WCAG AA (4.5:1) in both themes', (_role, c) => {
    expect(contrast(c.dark, '#080808')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.light, '#f5f5f5')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps nvim’s ordering: comments dimmest, plain text brightest (dark)', () => {
    const order = ['comment', 'ret', 'keyword', 'method', 'variable', 'property', 'plain'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(lum(ROLES[order[i]!].dark)).toBeGreaterThan(lum(ROLES[order[i - 1]!].dark));
    }
  });
});
