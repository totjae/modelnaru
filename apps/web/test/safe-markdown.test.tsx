import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown, safeLink } from '../app/safe-markdown';

describe('safe answer rendering', () => {
  it('renders raw HTML as text, blocks unsafe URLs and never loads Markdown images', () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown
        text={
          '<script>alert(1)</script><svg onload="alert(1)">\n[x](javascript:alert) [x](data:text/html,evil) ![tracker](https://example.com/pixel)\n```html\n<img src=x onerror=alert(1)>\n```'
        }
      />,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///x',
    'blob:https://site/x',
    '//evil.test/x',
    '/\\evil.test',
    'java\nscript:alert(1)',
  ])('rejects unsafe URL %s', (url) => {
    expect(safeLink(url)).toBeNull();
  });
  it('preserves incomplete fences, wide tables and a large answer without losing its tail', () => {
    const text =
      '# 제목\n| A | B |\n| --- | --- |\n| 값 | **강조** |\n```ts\n' +
      '긴코드'.repeat(10000) +
      '\n마지막';
    const html = renderToStaticMarkup(<SafeMarkdown text={text} />);
    expect(html).toContain('<table>');
    expect(html).toContain('<strong>강조</strong>');
    expect(html).toContain('마지막');
    const many = renderToStaticMarkup(
      <SafeMarkdown text={'문단\n'.repeat(2100) + '끝'} />,
    );
    expect(many).toContain('markdown-remainder');
    expect(many).toContain('끝');
  });
});
