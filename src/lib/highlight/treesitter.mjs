// @ts-check
/**
 * Build-time C/C++ highlighting with tree-sitter and the same nvim-treesitter queries the tutor's
 * Neovim uses (vendored under /vendor, integrity-checked by tests). Runs only while prerendering;
 * nothing here ships to the browser.
 */
import { readFile } from 'node:fs/promises';
import { Language, Parser, Query } from 'web-tree-sitter';
import { IGNORED_CAPTURES, roleForCapture } from './roles.mjs';

/** @typedef {import('./roles.mjs').Role} Role */
/** @typedef {import('web-tree-sitter').Node} TSNode */
/** @typedef {import('web-tree-sitter').QueryMatch} QueryMatch */
/** @typedef {import('web-tree-sitter').QueryPredicate} QueryPredicate */

const VENDOR = new URL('../../../vendor/', import.meta.url);

/** Code-block language → grammar. */
const LANGUAGES = /** @type {Record<string, 'cpp' | 'c'>} */ ({
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  h: 'cpp',
  c: 'c',
});

/** Query inheritance, as in nvim-treesitter (`; inherits: c` → c patterns first). */
const QUERY_FILES = { cpp: ['c', 'cpp'], c: ['c'] };

const DEFAULT_PRIORITY = 100;

/** @param {string} language */
export function grammarFor(language) {
  return LANGUAGES[language.toLowerCase()];
}

/** @type {Promise<void> | undefined} */
let initialized;
/** @type {Map<string, Promise<{ parser: Parser; query: Query }>>} */
const loaded = new Map();

/** @param {'cpp' | 'c'} grammar */
function load(grammar) {
  let entry = loaded.get(grammar);
  if (!entry) {
    entry = (async () => {
      initialized ??= Parser.init();
      await initialized;
      const language = await Language.load(await readFile(new URL(`tree-sitter/tree-sitter-${grammar}.wasm`, VENDOR)));
      const sources = await Promise.all(
        QUERY_FILES[grammar].map((name) =>
          readFile(new URL(`nvim-treesitter/queries/${name}/highlights.scm`, VENDOR), 'utf8'),
        ),
      );
      const parser = new Parser();
      parser.setLanguage(language);
      return { parser, query: new Query(language, sources.join('\n')) };
    })();
    loaded.set(grammar, entry);
  }
  return entry;
}

/**
 * Translate the Lua patterns used by nvim-treesitter's `#lua-match?` into a RegExp.
 * Supports character classes (%a %d %l %u %s %w %x %p and their negations), escapes, sets,
 * anchors and the `-` lazy quantifier.
 * @param {string} pattern
 */
export function luaPatternToRegExp(pattern) {
  /** @type {Record<string, string>} */
  const classes = {
    a: 'A-Za-z',
    d: '0-9',
    l: 'a-z',
    u: 'A-Z',
    s: '\\s',
    w: 'A-Za-z0-9',
    x: '0-9A-Fa-f',
    p: '!-/:-@\\[-`{-~',
    c: '\\x00-\\x1f\\x7f',
  };
  let out = '';
  let inSet = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = /** @type {string} */ (pattern[i]);
    if (ch === '%') {
      const next = pattern[++i] ?? '';
      const lower = next.toLowerCase();
      if (classes[lower]) {
        const body = classes[lower];
        const negated = next !== lower;
        if (inSet) out += body; // negated classes inside sets are not used by the queries
        else out += negated ? `[^${body}]` : `[${body}]`;
      } else {
        out += next.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
      }
    } else if (inSet) {
      if (ch === ']') inSet = false;
      out += ch === '\\' ? '\\\\' : ch;
    } else if (ch === '[') {
      inSet = true;
      out += ch;
      if (pattern[i + 1] === '^') out += pattern[++i];
    } else if (ch === '-') {
      out += '*?';
    } else if (ch === '^' && i === 0) {
      out += '^';
    } else if (ch === '$' && i === pattern.length - 1) {
      out += '$';
    } else if ('.*+?()'.includes(ch)) {
      out += ch;
    } else {
      out += ch.replace(/[{}|\\/^$]/g, '\\$&');
    }
  }
  return new RegExp(out);
}

/** @type {Map<string, RegExp>} */
const regexCache = new Map();
/** @type {Set<string>} */
const warned = new Set();

/**
 * @param {TSNode} node
 * @param {string[]} types
 * @param {boolean} ancestors check every ancestor instead of only the parent
 */
function hasAncestorOfType(node, types, ancestors) {
  for (let p = node.parent; p; p = ancestors ? p.parent : null) {
    if (types.includes(p.type)) return true;
  }
  return false;
}

/**
 * Evaluate the predicates web-tree-sitter leaves to the caller (it already applies #eq?, #match?,
 * #any-of?). Unknown predicates fail closed: the pattern does not apply.
 * @param {QueryPredicate[]} predicates
 * @param {QueryMatch} match
 */
function predicatesPass(predicates, match) {
  for (const { operator, operands } of predicates) {
    const [first, ...rest] = operands;
    if (!first || first.type !== 'capture') continue;
    const nodes = match.captures.filter((c) => c.name === first.name).map((c) => c.node);
    const args = rest.map((o) => (o.type === 'string' ? o.value : o.name));
    switch (operator) {
      case 'lua-match?': {
        const pattern = args[0] ?? '';
        let re = regexCache.get(pattern);
        if (!re) {
          re = luaPatternToRegExp(pattern);
          regexCache.set(pattern, re);
        }
        if (!nodes.every((n) => /** @type {RegExp} */ (re).test(n.text))) return false;
        break;
      }
      case 'has-parent?':
        if (!nodes.every((n) => hasAncestorOfType(n, args, false))) return false;
        break;
      case 'not-has-parent?':
        if (nodes.some((n) => hasAncestorOfType(n, args, false))) return false;
        break;
      case 'has-ancestor?':
        if (!nodes.every((n) => hasAncestorOfType(n, args, true))) return false;
        break;
      case 'not-has-ancestor?':
        if (nodes.some((n) => hasAncestorOfType(n, args, true))) return false;
        break;
      default:
        if (!warned.has(operator)) {
          warned.add(operator);
          console.warn(`[highlight] unsupported tree-sitter predicate ${operator}; pattern skipped`);
        }
        return false;
    }
  }
  return true;
}


/**
 * Role of every character (UTF-16 index) after Neovim-style precedence: higher `priority` wins;
 * at equal priority, inner nodes and later query patterns win. Uncaptured text is `undefined`.
 * @param {string} code
 * @param {'cpp' | 'c'} grammar
 * @returns {Promise<(Role | undefined)[]>}
 */
export async function rolesPerChar(code, grammar) {
  const { parser, query } = await load(grammar);
  const tree = parser.parse(code);
  /** @type {(Role | undefined)[]} */
  const painted = new Array(code.length);
  if (!tree) return painted;
  try {
    /** @type {{ start: number; end: number; role: Role; priority: number; pattern: number }[]} */
    const captures = [];
    for (const match of query.matches(tree.rootNode)) {
      if (!predicatesPass(query.predicates[match.patternIndex] ?? [], match)) continue;
      const priority = Number(query.setProperties[match.patternIndex]?.priority ?? DEFAULT_PRIORITY);
      for (const { name, node } of match.captures) {
        if (name.startsWith('_') || IGNORED_CAPTURES.has(name)) continue;
        const role = roleForCapture(name);
        if (!role) continue;
        captures.push({ start: node.startIndex, end: node.endIndex, role, priority, pattern: match.patternIndex });
      }
    }
    // Paint order: priority, then outer before inner, then earlier pattern before later.
    captures.sort(
      (a, b) => a.priority - b.priority || a.start - b.start || b.end - a.end || a.pattern - b.pattern,
    );
    for (const c of captures) painted.fill(c.role, c.start, c.end);
    return painted;
  } finally {
    tree.delete();
  }
}

/**
 * @typedef {{ start: number; end: number; role: Role }} RoleRange
 */

/**
 * Highlight a whole code block as sorted, non-overlapping ranges (UTF-16 offsets into `code`).
 * Uncaptured text gets no range (rendered with the "plain" role).
 * @param {string} code
 * @param {'cpp' | 'c'} grammar
 * @returns {Promise<RoleRange[]>}
 */
export async function highlightCode(code, grammar) {
  const painted = await rolesPerChar(code, grammar);
  /** @type {RoleRange[]} */
  const ranges = [];
  for (let i = 0; i < painted.length; ) {
    const role = painted[i];
    let j = i + 1;
    while (j < painted.length && painted[j] === role) j++;
    if (role && role !== 'plain') ranges.push({ start: i, end: j, role });
    i = j;
  }
  return ranges;
}
