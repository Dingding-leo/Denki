import { describe, expect, it } from 'vitest';
import { MEDIA_REFERENCE_PREFIX } from '../mediaRegistry';
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

  it('turns exact registry references into inert post-sanitization bindings', () => {
    const reference = `${MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;
    const html = renderContent(
      `![diagram](${reference})\n\n<audio controls src="${reference}"></audio>`,
      false,
      true,
    );

    expect(html).toContain(`data-denki-media-src="${reference}"`);
    expect(html.match(/data-denki-media-src=/g)).toHaveLength(2);
    expect(html).toContain('data-denki-media-state="pending"');
    expect(html).toContain('aria-busy="true"');

    const template = document.createElement('template');
    template.innerHTML = html;
    const mediaElements = [...template.content.querySelectorAll('img, audio')];
    expect(mediaElements).toHaveLength(2);
    expect(
      mediaElements.every((element) => !element.hasAttribute('src')),
    ).toBe(true);
  });

  it('restores registry references used as ordinary text without activating them', () => {
    const reference = `${MEDIA_REFERENCE_PREFIX}${'b'.repeat(64)}`;
    const html = renderContent(`Reference: ${reference}`, false, true);

    expect(html).toContain(reference);
    expect(html).not.toContain('data-denki-media-src');
  });

  it('does not activate malformed registry URLs or srcset candidates', () => {
    const malformed = `${MEDIA_REFERENCE_PREFIX}not-a-hash`;
    const valid = `${MEDIA_REFERENCE_PREFIX}${'c'.repeat(64)}`;
    const html = renderContent(
      `<img src="${malformed}" srcset="${valid} 2x" alt="unsafe">`,
      false,
      true,
    );

    expect(html).not.toContain('data-denki-media-');
    expect(html).not.toContain('srcset');
    expect(html).not.toContain(malformed);
    expect(html).not.toContain(valid);
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

    expect(code).toContain('&lt;div onclick="bad()"&gt;x&lt;/div&gt;');
    expect(code).not.toContain('<div onclick=');
    expect(empty).toBe('');
  });
});
