/**
 * High-performance, zero-dependency Markdown & Cloze Deletion Parser
 *
 * Processing order matters — code blocks are extracted first (before HTML
 * escaping) so that HTML-like syntax inside them is preserved literally.
 */
export const renderContent = (text: string, isCloze: boolean, showAnswer: boolean): string => {
  let html = text;

  // 1. Extract fenced code blocks BEFORE escaping so their content isn't
  //    double-escaped (e.g., `<div>` should show as `<div>` inside a code block,
  //    not `&lt;div&gt;`).
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'javascript';
    // Escape HTML *only* inside the code block content
    const escapedCode = code
      .trimEnd()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push(
      `<pre class="language-${language}"><code class="language-${language}">${escapedCode}</code></pre>`
    );
    return placeholder;
  });

  // 2. Extract inline code before escaping
  const inlineCode: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `%%INLINE_CODE_${inlineCode.length}%%`;
    inlineCode.push(`<code class="inline-code">${escaped}</code>`);
    return placeholder;
  });

  // 3. Escape remaining HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 4. Parse Cloze deletions: {{c1::answer}}
  if (isCloze) {
    const clozeRegex = /\{\{c\d+::(.*?)\}\}/g;
    if (showAnswer) {
      html = html.replace(clozeRegex, '<span class="cloze-blank revealed">$1</span>');
    } else {
      html = html.replace(clozeRegex, '<span class="cloze-blank">[ ... ]</span>');
    }
  }

  // 5. Parse Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 6. Parse Italics: *text* (avoid matching inside bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // 7. Parse Headers: ## Header or # Header
  html = html.replace(/^##\s+(.+)$/gm, '<h3 style="margin: 14px 0 8px 0; color: #a5b4fc; font-size: 1.25rem;">$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2 style="margin: 18px 0 10px 0; color: #6366f1; font-size: 1.5rem;">$1</h2>');

  // 8. Parse Bullet points: - item or * item (wrap in <ul>)
  html = html.replace(
    /((?:^\s*[-*]\s+.+$\n?)+)/gm,
    (block) => {
      const items = block
        .split('\n')
        .filter(line => /^\s*[-*]\s+/.test(line))
        .map(line => `<li style="margin-bottom: 4px; color: #d1d5db;">${line.replace(/^\s*[-*]\s+/, '')}</li>`)
        .join('');
      return `<ul style="margin: 6px 0; padding-left: 20px;">${items}</ul>`;
    }
  );

  // 9. Parse blockquotes: > text
  html = html.replace(
    /^&gt;\s+(.+)$/gm,
    '<blockquote style="border-left: 3px solid #6366f1; padding-left: 12px; margin: 8px 0; color: #9ca3af; font-style: italic;">$1</blockquote>'
  );

  // 10. Convert remaining newlines to breaks (skip lines already wrapped in block elements)
  html = html.replace(/\n/g, '<br />');

  // 11. Restore code blocks and inline code
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODE_BLOCK_${i}%%`, block);
  });
  inlineCode.forEach((code, i) => {
    html = html.replace(`%%INLINE_CODE_${i}%%`, code);
  });

  return html;
};
