// @ts-check
/**
 * Expressive Code plugin: re-highlights C/C++ blocks with tree-sitter + the tutor's nvim queries
 * (see treesitter.mjs) instead of Shiki's TextMate grammar. Other languages are left to Shiki.
 * Frames, copy button and light/dark switching keep working because only the per-token
 * InlineStyleAnnotations are replaced.
 */
import { InlineStyleAnnotation, definePlugin, isInlineStyleAnnotation } from '@astrojs/starlight/expressive-code';
import { ROLES } from './roles.mjs';
import { grammarFor, highlightCode } from './treesitter.mjs';

export function treesitterHighlight() {
  return definePlugin({
    name: 'nvim-treesitter-highlight',
    hooks: {
      // Runs after the built-in Shiki plugin's hook of the same name.
      performSyntaxAnalysis: async ({ codeBlock, styleVariants }) => {
        const grammar = grammarFor(codeBlock.language);
        if (!grammar) return;

        const lines = codeBlock.getLines();
        for (const line of lines) {
          for (const annotation of line.getAnnotations()) {
            if (isInlineStyleAnnotation(annotation)) line.deleteAnnotation(annotation);
          }
        }

        const ranges = await highlightCode(codeBlock.code, grammar);

        // Map block offsets to (line, column); getLines() is the code split on "\n".
        const lineStarts = [];
        let offset = 0;
        for (const line of lines) {
          lineStarts.push(offset);
          offset += line.text.length + 1;
        }

        for (let v = 0; v < styleVariants.length; v++) {
          const variant = /** @type {import('@astrojs/starlight/expressive-code').StyleVariant} */ (styleVariants[v]);
          const mode = variant.theme.type === 'light' ? 'light' : 'dark';
          for (let li = 0; li < lines.length; li++) {
            const line = /** @type {import('@astrojs/starlight/expressive-code').ExpressiveCodeLine} */ (lines[li]);
            const start = /** @type {number} */ (lineStarts[li]);
            const end = start + line.text.length;
            /** @param {number} from @param {number} to @param {import('./roles.mjs').Role} roleName */
            const add = (from, to, roleName) => {
              if (to <= from) return;
              const role = ROLES[roleName];
              line.addAnnotation(
                new InlineStyleAnnotation({
                  styleVariantIndex: v,
                  color: role[mode],
                  bold: role.bold,
                  inlineRange: { columnStart: from - start, columnEnd: to - start },
                  renderPhase: 'earliest',
                }),
              );
            };
            // Ranges are sorted and non-overlapping; gaps get Neovim's Normal ("plain") colour.
            let cursor = start;
            for (const r of ranges) {
              if (r.end <= start || r.start >= end) continue;
              const from = Math.max(r.start, start);
              add(cursor, from, 'plain');
              add(from, Math.min(r.end, end), r.role);
              cursor = Math.min(r.end, end);
            }
            add(cursor, end, 'plain');
          }
        }
      },
    },
  });
}
