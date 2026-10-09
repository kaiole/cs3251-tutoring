/**
 * Editor language for message bodies (part of the lazily loaded editor chunk).
 */
import { cppLanguage } from '@codemirror/lang-cpp';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { Language } from '@codemirror/language';
import { parseCode, type MarkdownParser } from '@lezer/markdown';
import { grammarForInfo } from './highlight';

/**
 * GFM Markdown (as the renderer parses it) with fenced code parsed as C++ where the renderer
 * would highlight it: untagged fences and the C/C++ aliases from highlight.ts. Other languages
 * (bash included) stay unhighlighted. Built from markdownLanguage directly instead of markdown(),
 * which would also bundle the HTML/CSS/JS grammars for inline HTML.
 */
export const messageLanguage = new Language(
  markdownLanguage.data,
  (markdownLanguage.parser as MarkdownParser).configure(
    parseCode({
      codeParser: (info) => {
        const grammar = grammarForInfo(info);
        return grammar === 'cpp' || grammar === 'c' ? cppLanguage.parser : null;
      },
    }),
  ),
  [],
  'markdown',
);
