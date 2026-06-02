/**
 * High-performance, zero-dependency Markdown & Cloze Deletion Parser
 */
export const renderContent = (text: string, isCloze: boolean, showAnswer: boolean): string => {
  let html = text;

  // 1. Escape basic HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Parse Cloze deletions: {{c1::answer}}
  if (isCloze) {
    const clozeRegex = /\{\{c\d+::(.*?)\}\}/g;
    if (showAnswer) {
      // Reveal the answer inside a highlighted span
      html = html.replace(clozeRegex, '<span class="cloze-blank revealed">$1</span>');
    } else {
      // Hide the answer as a prompt blank
      html = html.replace(clozeRegex, '<span class="cloze-blank">[ ... ]</span>');
    }
  }

  // 3. Parse Code blocks: ```js code ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'javascript';
    return `<pre class="language-${language}"><code class="language-${language}">${code.trim()}</code></pre>`;
  });

  // 4. Parse Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 5. Parse Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 6. Parse Italics: *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 7. Parse Headers: ## Header or # Header
  html = html.replace(/^##\s+(.+)$/gm, '<h3 style="margin: 14px 0 8px 0; color: #a5b4fc; font-size: 1.25rem;">$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2 style="margin: 18px 0 10px 0; color: #6366f1; font-size: 1.5rem;">$1</h2>');

  // 8. Parse Bullet points: - item or * item
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; color: #d1d5db;">$1</li>');

  // 9. Convert newlines to breaks (excluding tags)
  html = html.replace(/\n/g, '<br />');

  return html;
};
