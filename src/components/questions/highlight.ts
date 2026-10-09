/**
 * Syntax highlighting for fenced code in message bodies. Progressive enhancement: blocks render as
 * plain text until the highlighter has loaded, and stay plain if it fails. Shiki's core, the
 * JavaScript regex engine (no WASM, so no `wasm-unsafe-eval` in the CSP), the grammars and the
 * themes are all dynamic imports, fetched only once a page renders a block that needs them.
 * Output is plain token data rendered as React text nodes; no HTML strings.
 */
import type { HighlighterCore } from 'shiki/core';

export type Grammar = 'cpp' | 'c' | 'bash';

const ALIASES: Record<string, Grammar> = {
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  h: 'cpp', // C++ course: headers are C++.
  c: 'c',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  zsh: 'bash',
};

/**
 * Grammar for a fenced block from its code element's className (`language-xxx`, as kept by
 * rehype-sanitize). Untagged blocks are C++; unknown languages (including `text`) stay plain (null).
 */
export function grammarFor(className: unknown): Grammar | null {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : [];
  const tag = classes.find((c) => c.startsWith('language-'));
  if (!tag) return 'cpp';
  return aliasFor(tag.slice('language-'.length));
}

/**
 * Grammar for a fence's info string (as the editor sees it, e.g. "cpp" or "c++ title=x"): the
 * first word picks the language, like remark's `language-xxx` class. Same rules as grammarFor.
 */
export function grammarForInfo(info: string): Grammar | null {
  const word = info.trim().split(/\s+/, 1)[0] ?? '';
  return word ? aliasFor(word) : 'cpp';
}

// Own keys only: "constructor", "toString" etc. are unknown languages, not Object.prototype members.
function aliasFor(name: string): Grammar | null {
  const key = name.toLowerCase();
  return Object.hasOwn(ALIASES, key) ? ALIASES[key]! : null;
}

export type CodeToken = { content: string; color?: string; light?: string; italic?: boolean; bold?: boolean; underline?: boolean };

// Shiki's FontStyle bit flags.
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

/** Tokenize `code` into lines of plain token data: dark colour, light colour, shared font style. */
export function tokenize(highlighter: HighlighterCore, code: string, grammar: Grammar): CodeToken[][] {
  const lines = highlighter.codeToTokensWithThemes(code, { lang: grammar, themes: { dark: 'github-dark', light: 'github-light' } });
  return lines.map((line) =>
    line.map(({ content, variants }) => {
      const dark = variants.dark ?? {};
      const light = variants.light ?? {};
      // Apply a font style only when both themes agree, so it never differs from the active colours.
      const style = (dark.fontStyle ?? 0) > 0 && dark.fontStyle === light.fontStyle ? dark.fontStyle! : 0;
      const token: CodeToken = { content };
      if (dark.color) token.color = dark.color;
      if (light.color) token.light = light.color;
      if (style & ITALIC) token.italic = true;
      if (style & BOLD) token.bold = true;
      if (style & UNDERLINE) token.underline = true;
      return token;
    }),
  );
}

let promise: Promise<HighlighterCore | null> | null = null;
let loaded: HighlighterCore | null = null;
const listeners = new Set<() => void>();

/** Load the shared highlighter once. Resolves to null on failure (nothing is logged). */
export function loadHighlighter(): Promise<HighlighterCore | null> {
  promise ??= (async () => {
    try {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
      loaded = await createHighlighterCore({
        themes: [import('shiki/themes/github-dark.mjs'), import('shiki/themes/github-light.mjs')],
        langs: [import('shiki/langs/cpp.mjs'), import('shiki/langs/c.mjs'), import('shiki/langs/bash.mjs')],
        engine: createJavaScriptRegexEngine(),
      });
      listeners.forEach((notify) => notify());
      return loaded;
    } catch {
      return null;
    }
  })();
  return promise;
}

/** For useSyncExternalStore: the highlighter once loaded, else null. */
export const highlighterStore = {
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => listeners.delete(notify);
  },
  get: () => loaded,
  getServer: () => null,
};
