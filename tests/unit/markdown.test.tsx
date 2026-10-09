import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Markdown, { HighlightedCode } from '../../src/components/questions/Markdown';
import { grammarFor, loadHighlighter, tokenize } from '../../src/components/questions/highlight';

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe('restricted Markdown renderer', () => {
  it('shows raw HTML as text and never emits script or event handlers', () => {
    const out = html('<script>alert(1)</script>\n\nHi <img src=x onerror="alert(2)"> there');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<[^>]*\sonerror=/i); // only escaped text may mention it
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps C++ angle brackets typed outside code', () => {
    expect(html('Use std::vector<int> and #include <vector>')).toContain('std::vector&lt;int&gt;');
  });

  it('drops unsafe link protocols', () => {
    const out = html('[a](javascript:alert(1)) [b](data:text/html,x) [c](https://example.com)');
    expect(out).not.toMatch(/javascript:|data:text/);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
  });

  it('never loads remote images (no tracking pixels)', () => {
    const out = html('![pixel](https://evil.example/p.png)');
    expect(out).not.toMatch(/<img|evil\.example/);
    expect(out).toContain('[image: pixel]');
  });

  it('renders fenced code as plain text before the highlighter loads', () => {
    const out = html('```cpp\nint& r = a;\n```');
    expect(out).toContain('<pre><code class="language-cpp">int&amp; r = a;\n</code></pre>');
  });
});

describe('code highlighting', () => {
  it('maps fence languages to grammars', () => {
    expect(grammarFor(['language-cpp'])).toBe('cpp');
    expect(grammarFor(['language-C++'])).toBe('cpp');
    expect(grammarFor('language-hpp')).toBe('cpp');
    expect(grammarFor(['language-c'])).toBe('c');
    expect(grammarFor(['language-sh'])).toBe('bash');
    expect(grammarFor(['language-shell'])).toBe('bash');
  });

  it('treats untagged fences as C++ and unknown languages as plain', () => {
    expect(grammarFor(undefined)).toBe('cpp');
    expect(grammarFor([])).toBe('cpp');
    expect(grammarFor(['language-python'])).toBeNull();
    expect(grammarFor(['language-text'])).toBeNull();
  });

  it('renders highlighted tokens as escaped text with dual-theme colours', async () => {
    const highlighter = await loadHighlighter();
    expect(highlighter).not.toBeNull();
    const code = 'std::string s = "<script>alert(1)</script>";\n// <img src=x onerror=alert(2)>';
    const lines = tokenize(highlighter!, code, 'cpp');
    expect(lines.map((l) => l.map((t) => t.content).join('')).join('\n')).toBe(code);
    const out = renderToStaticMarkup(<HighlightedCode lines={lines} className="language-cpp" />);
    expect(out).not.toMatch(/<script|<img/i);
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toMatch(/<span style="color:#[0-9A-F]{6};--shiki-light:#[0-9A-F]{6}">/i);
  });
});
