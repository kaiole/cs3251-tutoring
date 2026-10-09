/**
 * CodeMirror 6 editor for the composer body. Loaded lazily by Composer (its own chunk, fetched only
 * when a composer renders); the composer falls back to a plain textarea until then or on failure.
 * The document is a plain string owned by Composer: user edits are pushed up via onChange, and
 * outside changes (reset after submit) are applied back without moving focus.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cppLanguage } from '@codemirror/lang-cpp';
import { bracketMatching, HighlightStyle, indentUnit, LanguageSupport, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { messageLanguage } from './editor-language';

export interface CodeEditorHandle {
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  vim: boolean;
  /** Called when the Vim chunk fails to load (the editor keeps working without it). */
  onVimUnavailable?: () => void;
  labelId: string;
  describedById: string;
  invalid: boolean;
  placeholder: string;
  hidden?: boolean;
  /** Focus on mount with this selection (handed over from the fallback textarea). */
  initialFocus?: { anchor: number; head: number } | null | undefined;
  handle: RefObject<CodeEditorHandle | null>;
}

// Colours are CSS custom properties (custom.css) so the light/dark switch needs no JS.
const markdownHighlight = HighlightStyle.define(
  [
    { tag: [t.processingInstruction, t.labelName, t.contentSeparator, t.url], color: 'var(--tq-cm-mark)' },
    { tag: t.heading, fontWeight: '600' },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.comment, color: 'var(--tq-cm-comment)' },
  ],
  { scope: messageLanguage },
);

const cppHighlight = HighlightStyle.define(
  [
    { tag: [t.variableName, t.propertyName, t.punctuation], color: 'var(--tq-cm-text)' },
    {
      tag: [t.keyword, t.modifier, t.operatorKeyword, t.operator, t.processingInstruction, t.standard(t.typeName), t.self],
      color: 'var(--tq-cm-keyword)',
    },
    { tag: [t.number, t.bool, t.null, t.atom, t.literal, t.escape, t.special(t.name)], color: 'var(--tq-cm-constant)' },
    { tag: [t.string, t.special(t.string), t.character], color: 'var(--tq-cm-string)' },
    { tag: t.comment, color: 'var(--tq-cm-comment)' },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName)), t.typeName, t.className, t.namespace],
      color: 'var(--tq-cm-function)',
    },
    { tag: t.labelName, color: 'var(--tq-cm-variable)' },
  ],
  { scope: cppLanguage },
);

const theme = EditorView.theme({
  '&': {
    border: '1px solid var(--q-border)',
    background: 'var(--sl-color-black)',
    color: 'var(--sl-color-white)',
  },
  '&.cm-focused': { outline: '2px solid var(--sl-color-white)', outlineOffset: '2px' },
  '.cm-scroller': {
    fontFamily: 'var(--sl-font-mono)',
    fontSize: 'var(--sl-text-sm)',
    lineHeight: '1.65',
    minHeight: '12rem',
    maxHeight: 'min(36rem, 70vh)',
    overflow: 'auto',
  },
  '.cm-content': { padding: '0.5rem 0', caretColor: 'var(--sl-color-white)' },
  '.cm-line': { padding: '0 0.75rem' },
  '.cm-activeLine': { backgroundColor: 'var(--sl-color-gray-6)' },
  '&:not(.cm-focused) .cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--sl-color-white)' },
  '.cm-selectionBackground': { background: 'var(--sl-color-gray-5)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': { background: 'var(--q-sel)' },
  '.cm-placeholder': { color: 'var(--sl-color-gray-3)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--sl-color-gray-5)' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'transparent', textDecoration: 'underline wavy var(--sl-color-gray-3)' },
  // Vim: status line inside the frame, block cursor in inverse video, gray search matches.
  '.cm-panels': { backgroundColor: 'var(--sl-color-black)', color: 'var(--sl-color-gray-2)' },
  '.cm-panels-bottom': { borderTop: '1px solid var(--sl-color-gray-5)' },
  '.cm-vim-panel': { fontFamily: 'var(--sl-font-mono)', fontSize: '12px', lineHeight: '1.6', padding: '0.125rem 0.75rem' },
  '.cm-vim-panel input': { color: 'var(--sl-color-white)', font: 'inherit' },
  '.cm-vim-panel span': { fontFamily: 'inherit !important' }, // the `:` prompt sets an inline font
  '.cm-vimCursorLayer': { mixBlendMode: 'difference' },
  // "&.cm-editor" outranks the vim package's own (highest-precedence) cursor colours.
  '&.cm-editor .cm-fat-cursor': { background: '#ffffff', color: 'transparent !important' },
  '&.cm-editor:not(.cm-focused) .cm-fat-cursor': { background: 'none', outline: '1px solid #808080' },
  '.cm-searchMatch': { backgroundColor: 'var(--sl-color-gray-5)' },
});

/** Marks transactions that apply Composer's value, so they are not echoed back up. */
const fromProps = Annotation.define<boolean>();

let vimPromise: Promise<() => Extension> | null = null;
function loadVim(): Promise<() => Extension> {
  vimPromise ??= import('./editor-vim').then(
    (m) => m.vimExtension,
    (err: unknown) => {
      vimPromise = null; // allow a later retry
      throw err;
    },
  );
  return vimPromise;
}

const contentAttributes = (p: Pick<CodeEditorProps, 'labelId' | 'describedById' | 'invalid'>) =>
  EditorView.contentAttributes.of({
    'aria-labelledby': p.labelId,
    'aria-describedby': p.describedById,
    'aria-multiline': 'true',
    'aria-invalid': p.invalid ? 'true' : 'false',
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
    'data-composer-body': '',
  });

export default function CodeEditor(props: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const slots = useRef({ vim: new Compartment(), attrs: new Compartment() }).current;
  const latest = useRef(props);
  latest.current = props;
  /** The last document string pushed up through onChange (or applied from props). */
  const synced = useRef(props.value);

  // Create the view once; later prop changes are applied through compartments and transactions.
  useEffect(() => {
    const p = latest.current;
    const doc = p.value;
    const focus = p.initialFocus;
    // A restored draft continues where it ends.
    const selection = focus
      ? EditorSelection.single(Math.min(focus.anchor, doc.length), Math.min(focus.head, doc.length))
      : EditorSelection.cursor(doc.length);
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc,
        selection,
        extensions: [
          slots.vim.of([]), // Vim must precede the other keymaps.
          history(),
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          EditorState.tabSize.of(4),
          indentUnit.of('    '),
          EditorView.lineWrapping,
          new LanguageSupport(messageLanguage),
          syntaxHighlighting(markdownHighlight),
          syntaxHighlighting(cppHighlight),
          placeholder(p.placeholder),
          // Tab indents; Escape then Tab, or Ctrl-M (Shift-Alt-M on macOS), lets Tab leave the editor.
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          slots.attrs.of(contentAttributes(p)),
          theme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || update.transactions.some((tr) => tr.annotation(fromProps))) return;
            const value = update.state.doc.toString();
            synced.current = value;
            latest.current.onChange(value);
          }),
        ],
      }),
    });
    viewRef.current = view;
    p.handle.current = { focus: () => view.focus() };
    if (focus) view.focus();
    return () => {
      if (p.handle.current && viewRef.current === view) p.handle.current = null;
      viewRef.current = null;
      view.destroy();
    };
  }, [slots]);

  // Outside changes to the value: replace only the differing middle, keep focus where it is.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || props.value === synced.current) return;
    const current = view.state.doc.toString();
    synced.current = props.value;
    if (current === props.value) return;
    const next = props.value;
    let start = 0;
    const max = Math.min(current.length, next.length);
    while (start < max && current.charCodeAt(start) === next.charCodeAt(start)) start++;
    let end = 0;
    while (end < max - start && current.charCodeAt(current.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
    view.dispatch({
      changes: { from: start, to: current.length - end, insert: next.slice(start, next.length - end) },
      annotations: fromProps.of(true),
    });
  }, [props.value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: slots.attrs.reconfigure(contentAttributes(props)) });
  }, [slots, props.labelId, props.describedById, props.invalid]);

  // Vim on/off without recreating the editor: content, selection and undo history are kept.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!props.vim) {
      view.dispatch({ effects: slots.vim.reconfigure([]) });
      return;
    }
    let live = true;
    loadVim().then(
      (vimExtension) => {
        if (live && viewRef.current === view) view.dispatch({ effects: slots.vim.reconfigure(vimExtension()) });
      },
      () => {
        // Nothing logged: the failure is a network/chunk error and the editor works without Vim.
        if (live) latest.current.onVimUnavailable?.();
      },
    );
    return () => {
      live = false;
    };
  }, [slots, props.vim]);

  return <div ref={hostRef} className="tq-editor not-content" hidden={props.hidden} />;
}
