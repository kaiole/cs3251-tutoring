/**
 * Restricted Markdown for student/tutor messages: GFM, raw HTML shown as text, no images (no remote loads or
 * tracking pixels: <img> is rendered as alt text and src is never used), only http(s)/mailto/same-page links, sanitized output. Code is shown as text.
 */
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

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

const components: Components = {
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
