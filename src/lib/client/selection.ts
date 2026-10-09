/**
 * Highlight → Ask: snapshot the current selection inside a note's article content as plain text.
 * Rules: text only, never HTML; code whitespace preserved exactly; a
 * selection wholly inside one code block is a code excerpt with its language; nearest preceding
 * heading recorded; no silent truncation.
 */
import { codePointLength, HEADING_RE, LANGUAGE_RE, LIMITS } from '../validation';

export interface SelectionSnapshot {
  text: string;
  kind: 'text' | 'code';
  language?: string;
  heading?: string;
  headingText?: string;
}

export type CaptureResult = { ok: true; snapshot: SelectionSnapshot } | { ok: false; reason: 'too_long' };

/** Elements whose text is UI, not note content. */
const UI_SELECTOR = 'button, [role="button"], .copy, .sl-anchor-link, [data-tq-ui]';

function elementOf(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function closestPre(node: Node): HTMLPreElement | null {
  return (elementOf(node)?.closest('pre') as HTMLPreElement | null) ?? null;
}

/** Text of the part of `el` covered by `range`, clipped to the range's ends. */
function clippedText(el: Element, range: Range): string {
  const part = document.createRange();
  part.selectNodeContents(el);
  if (el.contains(range.startContainer)) part.setStart(range.startContainer, range.startOffset);
  if (el.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
  return part.toString();
}

/** Code text for a range inside one <pre>, line by line (Expressive Code renders one div per line). */
function codeText(pre: HTMLPreElement, range: Range): string {
  const lines = Array.from(pre.querySelectorAll('.ec-line'));
  if (lines.length === 0) return range.toString();
  const out: string[] = [];
  for (const line of lines) {
    if (!range.intersectsNode(line)) continue;
    const code = line.querySelector('.code') ?? line;
    // Empty lines render as a lone "\n"; the join below supplies the line break.
    out.push(clippedText(code, range).replace(/\n$/, ''));
  }
  return out.join('\n');
}

function languageOf(pre: HTMLPreElement): string | undefined {
  const lang = pre.dataset.language ?? pre.closest('[data-language]')?.getAttribute('data-language') ?? undefined;
  return lang && LANGUAGE_RE.test(lang) && lang !== 'plaintext' && lang !== 'txt' ? lang : undefined;
}

function nearestHeading(root: Element, node: Node): { id: string; text: string } | undefined {
  let found: HTMLElement | undefined;
  for (const h of Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'))) {
    // Heading precedes (or contains) the selection start.
    const pos = h.compareDocumentPosition(node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING || pos & Node.DOCUMENT_POSITION_CONTAINED_BY) found = h;
    else break;
  }
  if (!found || !HEADING_RE.test(found.id)) return undefined;
  return { id: found.id, text: (found.textContent ?? '').trim().slice(0, 200) };
}

/** Returns null when there is no usable selection inside `root`. */
export function captureSelection(root: Element): CaptureResult | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const startEl = elementOf(range.startContainer);
  if (startEl?.closest(UI_SELECTOR) && elementOf(range.endContainer)?.closest(UI_SELECTOR)) return null;

  const startPre = closestPre(range.startContainer);
  const endPre = closestPre(range.endContainer);
  let snapshot: SelectionSnapshot;
  if (startPre && startPre === endPre) {
    const text = codeText(startPre, range);
    const language = languageOf(startPre);
    snapshot = { text, kind: 'code', ...(language ? { language } : {}) };
  } else {
    // Prose or mixed prose/code: whitespace-preserving plain text. Only outer blank space of
    // prose is dropped; inner line breaks stay.
    const text = sel.toString().replace(/^\s*\n/, '').replace(/\n\s*$/, '');
    snapshot = { text: startPre || endPre ? text : text.trim(), kind: 'text' };
  }
  if (!/\S/.test(snapshot.text)) return null;
  if (codePointLength(snapshot.text) > LIMITS.excerpt) return { ok: false, reason: 'too_long' };

  const heading = nearestHeading(root, range.startContainer);
  if (heading) {
    snapshot.heading = heading.id;
    snapshot.headingText = heading.text;
  }
  return { ok: true, snapshot };
}
