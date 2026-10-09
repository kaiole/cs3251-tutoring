import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { messageLanguage } from '../../src/components/questions/editor-language';
import { grammarFor, grammarForInfo } from '../../src/components/questions/highlight';
import { loadVimPref, saveVimPref } from '../../src/lib/client/vim-pref';

describe('fence languages', () => {
  it('maps info strings like the renderer maps language-* classes', () => {
    expect(grammarForInfo('')).toBe('cpp');
    expect(grammarForInfo('   ')).toBe('cpp');
    expect(grammarForInfo('cpp')).toBe('cpp');
    expect(grammarForInfo('C++ title="x"')).toBe('cpp');
    expect(grammarForInfo('hpp')).toBe('cpp');
    expect(grammarForInfo('c')).toBe('c');
    expect(grammarForInfo('sh')).toBe('bash');
    expect(grammarForInfo('python')).toBeNull();
    expect(grammarForInfo('text')).toBeNull();
  });

  it('treats Object.prototype names as unknown languages', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(grammarForInfo(name)).toBeNull();
      expect(grammarFor([`language-${name}`])).toBeNull();
    }
  });
});

describe('editor Markdown language', () => {
  // Names of the syntax nodes covering `needle`, outermost first (including mounted fence trees).
  function nodesAt(doc: string, needle: string): string[] {
    const state = EditorState.create({ doc, extensions: messageLanguage });
    const tree = ensureSyntaxTree(state, doc.length, 5000)!;
    const names: string[] = [];
    for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(doc.indexOf(needle) + 1, 1); node; node = node.parent) {
      names.unshift(node.name);
    }
    return names;
  }

  it('parses untagged and C/C++ fences as C++', () => {
    for (const info of ['', 'cpp', 'c++', 'cc', 'h', 'c']) {
      expect(nodesAt('Text\n\n```' + info + '\nint main() { return 0; }\n```\n', 'return')).toContain('ReturnStatement');
    }
  });

  it('leaves unknown fence languages unparsed', () => {
    for (const info of ['python', 'bash', 'constructor', 'text']) {
      const names = nodesAt('```' + info + '\nint main() { return 0; }\n```\n', 'return');
      expect(names).toContain('FencedCode');
      expect(names).not.toContain('ReturnStatement');
    }
  });
});

describe('Vim preference', () => {
  function memory() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  }

  it('defaults to off and round-trips', () => {
    const store = memory();
    expect(loadVimPref(() => store)).toBe(false);
    saveVimPref(true, () => store);
    expect(loadVimPref(() => store)).toBe(true);
    saveVimPref(false, () => store);
    expect(loadVimPref(() => store)).toBe(false);
  });

  it('tolerates missing or throwing storage', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    expect(loadVimPref(denied)).toBe(false);
    expect(() => saveVimPref(true, denied)).not.toThrow();
    const throwing = { getItem: denied, setItem: denied, removeItem: denied };
    expect(loadVimPref(() => throwing)).toBe(false);
    expect(() => saveVimPref(true, () => throwing)).not.toThrow();
  });
});
