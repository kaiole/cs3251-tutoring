// @ts-check
/**
 * Code colours for C/C++, mirroring the tutor's Neovim scheme
 * (dotfiles nvim/colors/palette.lua with the lackluster-red palette). The grouping, ordering and
 * bold come from nvim; each step is lifted so text keeps ≥ 4.5:1 on the code background
 * (#080808 dark / #f5f5f5 light). Strings keep the palette's muted red — the site's only hue.
 */

/** @typedef {'comment' | 'ret' | 'keyword' | 'name' | 'method' | 'variable' | 'property' | 'plain' | 'string'} Role */

/** Role → colours. nvim's original value is noted for reference. */
export const ROLES = /** @type {const} */ ({
  comment: { dark: '#7a7a7a', light: '#707070', bold: false }, // nvim #444444
  ret: { dark: '#858585', light: '#666666', bold: false }, // nvim #505050 (return / throw)
  keyword: { dark: '#8c8c8c', light: '#5e5e5e', bold: true }, // nvim #555555 bold
  name: { dark: '#8c8c8c', light: '#5e5e5e', bold: false }, // nvim #555555 (types, calls, constants)
  method: { dark: '#999999', light: '#555555', bold: false }, // nvim #666666 (method definitions)
  variable: { dark: '#aaaaaa', light: '#444444', bold: false }, // nvim #7a7a7a (vars, operators, punctuation)
  property: { dark: '#cccccc', light: '#2a2a2a', bold: false }, // nvim #aaaaaa
  plain: { dark: '#dddddd', light: '#191919', bold: false }, // nvim Normal #cccccc (uncaptured text)
  string: { dark: '#aa6666', light: '#8a4848', bold: false }, // nvim #aa6666
});

/**
 * Treesitter capture → role, as resolved by palette.lua (including its `@function` → `@keyword`
 * link). Lookups fall back by dropping trailing segments, like Neovim: `@keyword.return` is
 * listed explicitly; `@keyword.directive` falls back to `@keyword`.
 * A Map (not an object literal) so names like `constructor` never hit Object.prototype.
 * @type {Map<string, Role>}
 */
export const CAPTURE_ROLES = new Map(/** @type {[string, Role][]} */ (Object.entries({
  comment: 'comment',
  'function.builtin': 'comment',
  'module.builtin': 'comment',
  'tag.attribute': 'comment',

  'keyword.return': 'ret',
  'keyword.exception': 'ret',

  keyword: 'keyword',
  function: 'keyword', // palette.lua links @function to @keyword (bold)

  'function.call': 'name',
  'function.method.call': 'name',
  type: 'name',
  constant: 'name',
  number: 'name',
  boolean: 'name',
  module: 'name',
  attribute: 'name',
  label: 'name',
  tag: 'name',

  'function.method': 'method',

  variable: 'variable',
  operator: 'variable',
  punctuation: 'variable',
  constructor: 'variable',

  property: 'property',

  string: 'string',
  character: 'string',

  none: 'plain',
})));

/** Captures that never colour text in Neovim. */
export const IGNORED_CAPTURES = new Set(['spell', 'nospell', 'conceal']);

/**
 * @param {string} capture capture name without the leading "@"
 * @returns {Role | undefined}
 */
export function roleForCapture(capture) {
  const parts = capture.split('.');
  while (parts.length) {
    const role = CAPTURE_ROLES.get(parts.join('.'));
    if (role) return role;
    parts.pop();
  }
  return undefined;
}
