/**
 * Restricted Markdown for student/tutor messages: GFM, raw HTML shown as text, no images (no remote loads or
 * tracking pixels: <img> is rendered as alt text and src is never used), only http(s)/mailto/same-page links, sanitized output.
 * Fenced code is syntax-highlighted once the lazy highlighter loads (see ./highlight): tokens are rendered as
 * React text nodes in styled spans, never as HTML. Until then, or if it fails, code is plain text. Inline code is never highlighted.
 */
import { Fragment, useEffect, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { grammarFor, highlighterStore, loadHighlighter, tokenize, type CodeToken, type Grammar } from './highlight';

const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => !['picture', 'source', 'video', 'audio', 'iframe', 'input'].includes(t)),
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'] },
};

export function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? trimmed : '';
  } catch {
    return '';
  }
}

type MdNode = { type: string; value?: string; children?: MdNode[] };

/**
 * Show raw HTML as literal text instead of dropping it. Safe (it is only ever text) and important
 * for C++: `std::vector<int>` or `#include <vector>` typed outside backticks must not vanish.
 */
function remarkHtmlAsText() {
  const walk = (node: MdNode, inline: boolean) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type !== 'html') {
        walk(child, inline || child.type === 'paragraph' || child.type === 'heading');
        return child;
      }
      const text = { type: 'text', value: child.value ?? '' };
      return inline ? text : { type: 'paragraph', children: [text] };
    });
  };
  return (tree: MdNode) => walk(tree, false);
}

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };

const textOf = (node: HastNode): string => (node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join(''));

/** Highlighted token lines as React elements. Token content is only ever a text child. */
export function HighlightedCode({ lines, className }: { lines: CodeToken[][]; className?: string | undefined }) {
  return (
    <code className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line.map((t, j) => {
            const style: CSSProperties & Record<'--shiki-light', string | undefined> = {
              color: t.color,
              '--shiki-light': t.light,
              fontStyle: t.italic ? 'italic' : undefined,
              fontWeight: t.bold ? 'bold' : undefined,
              textDecoration: t.underline ? 'underline' : undefined,
            };
            return (
              <span key={j} style={style}>
                {t.content}
              </span>
            );
          })}
          {i < lines.length - 1 ? '\n' : null}
        </Fragment>
      ))}
    </code>
  );
}

function CodeBlock({ code, grammar, className, fallback }: { code: string; grammar: Grammar; className?: string | undefined; fallback: ReactNode }) {
  const highlighter = useSyncExternalStore(highlighterStore.subscribe, highlighterStore.get, highlighterStore.getServer);
  useEffect(() => {
    void loadHighlighter();
  }, []);
  const lines = useMemo(() => {
    if (!highlighter) return null;
    try {
      // Markdown keeps the fence's trailing newline; drop it so there is no empty last line.
      return tokenize(highlighter, code.replace(/\n$/, ''), grammar);
    } catch {
      return null; // Never log: the code is message content.
    }
  }, [highlighter, code, grammar]);
  if (!lines) return <pre>{fallback}</pre>;
  return (
    <pre className="tq-hl">
      <HighlightedCode lines={lines} className={className} />
    </pre>
  );
}

const components: Components = {
  pre: ({ node, children }) => {
    const code = (node?.children as HastNode[] | undefined)?.find((c) => c.type === 'element' && c.tagName === 'code');
    const grammar = code ? grammarFor(code.properties?.className) : null;
    if (!code || !grammar) return <pre>{children}</pre>;
    const className = Array.isArray(code.properties?.className) ? code.properties.className.join(' ') : undefined;
    return <CodeBlock code={textOf(code)} grammar={grammar} className={className} fallback={children} />;
  },
  a: ({ href, children }) =>
    href ? (
      <a href={href} rel="noopener noreferrer nofollow ugc">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ alt }) => <span className="tq-md-image">[image: {alt || 'no description'}]</span>,
};

export default function Markdown({ source }: { source: string }) {
  return (
    <div className="tq-md sl-markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHtmlAsText]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={safeUrl}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
