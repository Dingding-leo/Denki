import { describe, expect, it } from 'vitest';
import { renderContent } from '../markdown';

describe('renderContent', () => {
  it('renders common Markdown consistently', () => {
    const html = renderContent('## Heading\n\n**Bold** and `code`\n\n- one\n- two', false, true);

    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('hides and reveals cloze answers, including optional hints', () => {
    const source = 'The {{c1::mandible::lower jaw}} articulates at the TMJ.';

    const hidden = renderContent(source, true, false);
    const revealed = renderContent(source, true, true);

    expect(hidden).toContain('class="cloze-blank"');
    expect(hidden).toContain('[ lower jaw ]');
    expect(hidden).not.toContain('mandible');
    expect(revealed).toContain('class="cloze-blank revealed"');
    expect(revealed).toContain('mandible');
  });

  it('keeps safe imported image and audio media while removing executable attributes', () => {
    const html = renderContent(
      '<img src="data:image/png;base64,AAAA" alt="diagram" onerror="alert(1)">' +
        '<audio controls preload="none" src="data:audio/mpeg;base64,AAAA" onplay="alert(2)"></audio>',
      false,
      true,
    );

    expect(html).toContain('<img');
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain('<audio');
    expect(html).toContain('data:audio/mpeg;base64,AAAA');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onplay');
  });

  it('removes scripts, dangerous URLs, forms, and layout-breaking inline styles', () => {
    const html = renderContent(
      '<script>alert(1)</script>' +
        '<a href="javascript:alert(2)">bad link</a>' +
        '<form><input value="x"></form>' +
        '<p style="position:fixed;inset:0">safe text</p>',
      false,
      true,
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('style=');
    expect(html).toContain('safe text');
  });

  it('escapes HTML-looking text inside fenced code and tolerates non-string input', () => {
    const code = renderContent('```html\n<div onclick="bad()">x</div>\n```', false, true);
    const empty = renderContent(null as unknown as string, false, true);

    expect(code).toContain('&lt;div onclick=&quot;bad()&quot;&gt;x&lt;/div&gt;');
    expect(code).not.toContain('<div onclick=');
    expect(empty).toBe('');
  });
});
