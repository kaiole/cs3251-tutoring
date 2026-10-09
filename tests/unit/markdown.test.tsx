import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Markdown from '../../src/components/questions/Markdown';

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

  it('renders fenced code as text', () => {
    const out = html('```cpp\nint& r = a;\n```');
    expect(out).toContain('<pre><code class="language-cpp">int&amp; r = a;\n</code></pre>');
  });
});
