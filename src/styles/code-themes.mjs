// @ts-check
/**
 * Monochrome syntax themes from the lackluster grays (no hue). Highlighting is carried by
 * brightness, bold and italic only. Steps are lifted from the palette's dim syntax_* values so
 * code and comments keep ≥ 4.5:1 contrast on the code background in both themes.
 */
import { ExpressiveCodeTheme } from '@astrojs/starlight/expressive-code';

/** Role → [dark, light] colour. @type {Record<string, [string, string]>} */
const ROLE = {
  text: ['#aaaaaa', '#2a2a2a'],
  comment: ['#7a7a7a', '#555555'],
  keyword: ['#cccccc', '#080808'],
  type: ['#aaaaaa', '#2a2a2a'],
  bright: ['#dddddd', '#080808'], // functions, strings, numbers, constants
  punctuation: ['#7a7a7a', '#555555'],
  preprocessor: ['#aaaaaa', '#2a2a2a'],
};

/** TextMate scope groups → role and font style. */
const RULES = [
  { role: 'comment', fontStyle: 'italic', scope: ['comment', 'punctuation.definition.comment'] },
  {
    role: 'keyword',
    fontStyle: 'bold',
    scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.other'],
  },
  { role: 'punctuation', fontStyle: '', scope: ['keyword.operator', 'punctuation', 'meta.brace', 'meta.delimiter'] },
  { role: 'type', fontStyle: '', scope: ['entity.name.type', 'support.type', 'entity.name.class', 'entity.name.namespace'] },
  {
    role: 'bright',
    fontStyle: '',
    scope: [
      'entity.name.function',
      'support.function',
      'string',
      'constant.numeric',
      'constant.language',
      'constant.character',
      'constant.other',
      'variable.other.constant',
    ],
  },
  { role: 'preprocessor', fontStyle: 'italic', scope: ['meta.preprocessor', 'keyword.control.directive', 'entity.name.function.preprocessor'] },
  { role: 'text', fontStyle: '', scope: ['variable', 'variable.parameter', 'variable.other.member', 'entity.name.variable'] },
];

/** @param {'dark' | 'light'} type */
function build(type) {
  /** @param {[string, string] | undefined} pair */
  const pick = (pair) => (pair ? pair[type === 'dark' ? 0 : 1] : '#aaaaaa');
  return new ExpressiveCodeTheme({
    name: `lackluster-mono-${type}`,
    type,
    colors: {
      'editor.background': type === 'dark' ? '#080808' : '#f5f5f5',
      'editor.foreground': pick(ROLE.text),
    },
    tokenColors: [
      { settings: { foreground: pick(ROLE.text) } },
      ...RULES.map((r) => ({
        scope: r.scope,
        settings: { foreground: pick(ROLE[r.role]), fontStyle: r.fontStyle },
      })),
    ],
  });
}

export const lacklusterMonoDark = build('dark');
export const lacklusterMonoLight = build('light');
