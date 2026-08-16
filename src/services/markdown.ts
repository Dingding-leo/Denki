import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface ClozeToken {
  token: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Convert Denki card content into sanitized HTML.
 *
 * One renderer is shared by Review, Learn, and Match modes so Markdown, cloze
 * deletion, imported Anki media, and security rules cannot drift apart. Raw
 * HTML is accepted only so legitimate imported <img>/<audio> content can work;
 * DOMPurify is always the final step before anything reaches the DOM.
 */
export const renderContent = (
  text: string,
  isCloze: boolean,
  showAnswer: boolean,
): string => {
  let source = String(text ?? '').replace(/^\uFEFF/, '');
  const clozeTokens: ClozeToken[] = [];

  if (isCloze) {
    source = source.replace(/\{\{c\d+::([\s\S]*?)\}\}/g, (_match, innerValue: string) => {
      const separatorIndex = innerValue.indexOf('::');
      const answer = separatorIndex >= 0
        ? innerValue.slice(0, separatorIndex)
        : innerValue;
      const hint = separatorIndex >= 0
        ? innerValue.slice(separatorIndex + 2)
        : '';
      const display = showAnswer
        ? answer
        : hint.trim()
          ? `[ ${hint.trim()} ]`
          : '[ ... ]';
      const token = `DENKICLOZETOKEN${clozeTokens.length}END`;

      clozeTokens.push({
        token,
        html: `<span class="cloze-blank${showAnswer ? ' revealed' : ''}">${escapeHtml(display)}</span>`,
      });
      return token;
    });
  }

  let rendered = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  for (const { token, html } of clozeTokens) {
    rendered = rendered.replaceAll(token, html);
  }

  return DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['audio', 'video', 'source'],
    ADD_ATTR: ['controls', 'preload', 'poster', 'playsinline'],
    ADD_DATA_URI_TAGS: ['img', 'audio', 'video', 'source'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'meta',
      'link',
      'base',
    ],
    FORBID_ATTR: ['style', 'srcdoc', 'formaction'],
  });
};
