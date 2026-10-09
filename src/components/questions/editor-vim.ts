/**
 * Vim keys for the composer editor. Its own chunk: imported only once someone turns Vim on.
 */
import { vim, Vim } from '@replit/codemirror-vim';
import type { EditorView } from '@codemirror/view';

// `:w` submits the composer the editor sits in. Registered once per page (module evaluation), and
// resolved from the editor's DOM so it never holds on to a particular component instance.
Vim.defineEx('write', 'w', (cm) => {
  const view = cm.cm6 as EditorView;
  view.dom.closest('form')?.requestSubmit();
});

/** The status line (mode, pending keys, `:` prompt) is a panel inside the editor frame. */
export const vimExtension = () => vim({ status: true });
