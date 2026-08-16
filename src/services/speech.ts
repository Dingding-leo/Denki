import type { Card } from '../db/schema';
import { renderContent } from './markdown';

export const SPEECH_SPEED_KEY = 'denki-speech-speed';
export const SPEECH_SPEED_MIN = 0.5;
export const SPEECH_SPEED_MAX = 2;
export const DEFAULT_SPEECH_SPEED = 1;

export function normalizeSpeechRate(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_SPEECH_SPEED;
  return Math.min(SPEECH_SPEED_MAX, Math.max(SPEECH_SPEED_MIN, parsed));
}

export function loadSpeechRate(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SPEECH_SPEED;
    return normalizeSpeechRate(localStorage.getItem(SPEECH_SPEED_KEY));
  } catch {
    return DEFAULT_SPEECH_SPEED;
  }
}

function resolveClozeForSpeech(source: string, reveal: boolean): string {
  return String(source ?? '').replace(
    /\{\{c\d+::([\s\S]*?)\}\}/g,
    (_match, innerValue: string) => {
      const separatorIndex = innerValue.indexOf('::');
      const answer = separatorIndex >= 0
        ? innerValue.slice(0, separatorIndex)
        : innerValue;
      const hint = separatorIndex >= 0
        ? innerValue.slice(separatorIndex + 2).trim()
        : '';

      if (reveal) return answer;
      return hint ? `blank, hint: ${hint}` : 'blank';
    },
  );
}

function renderedContentToText(source: string): string {
  const withoutFencedCode = String(source ?? '').replace(
    /```[\s\S]*?```/g,
    ' code block ',
  );
  const html = renderContent(withoutFencedCode, false, true)
    .replace(/<(?:br\s*\/?|\/(?:p|div|li|h[1-6]|blockquote|pre))>/gi, ' ');

  if (typeof document === 'undefined') {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('pre, audio, video, source').forEach((node) => node.remove());
  return (container.textContent ?? '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build exactly what the learner should hear for the visible card side.
 * A hidden cloze is spoken as "blank" (and its visible hint, if any),
 * never as the answer. On the back, the revealed sentence is read before
 * the card's explanation so audio matches what is visibly on screen.
 */
export function getCardSpeechText(card: Card, isFlipped: boolean): string {
  if (card.cardType === 'cloze') {
    const clozeSentence = renderedContentToText(
      resolveClozeForSpeech(card.front, isFlipped),
    );
    if (!isFlipped) return clozeSentence;

    const explanation = renderedContentToText(card.back);
    return [clozeSentence, explanation].filter(Boolean).join('. ');
  }

  return renderedContentToText(isFlipped ? card.back : card.front);
}
