export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export class AIError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'AIError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function firstArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      if (Array.isArray(item)) return item;
    }
  }
  return null;
}

function createCardId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // Fall through for restricted/legacy webviews.
  }
  return `denki-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toFlashcards(items: unknown[]): Flashcard[] {
  const cards: Flashcard[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const question = item.question;
    const answer = item.answer;
    if (
      typeof question === 'string' &&
      typeof answer === 'string' &&
      question.trim() &&
      answer.trim()
    ) {
      cards.push({
        id: createCardId(),
        question: question.trim(),
        answer: answer.trim(),
      });
    }
  }
  return cards;
}

/** Accept string content and the text-part arrays used by some compatible APIs. */
function extractMessageText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.text === 'string') return value.text;
  if (!Array.isArray(value)) return null;

  const parts: string[] = [];
  for (const part of value) {
    if (typeof part === 'string') {
      parts.push(part);
    } else if (isRecord(part) && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}

function extractProviderContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new AIError('The provider response did not include a choices array.');
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new AIError('The provider response did not include a message.');
  }
  const text = extractMessageText(firstChoice.message.content);
  if (!text?.trim()) {
    throw new AIError('The provider returned an empty or unsupported message format.');
  }
  return text.trim();
}

function removeCodeFence(content: string): string {
  const match = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : content;
}

export async function generateFlashcards(
  text: string,
  apiKey: string,
  apiUrl: string = import.meta.env.VITE_AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
): Promise<Flashcard[]> {
  if (!apiKey) throw new AIError('API key is required. Please configure it in settings.');
  if (!text.trim()) throw new AIError('Content cannot be empty.');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiUrl);
  } catch {
    throw new AIError('The configured API endpoint is not a valid URL.');
  }

  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !isLoopback) {
    throw new AIError(
      'The API endpoint must use HTTPS (or be a local server). Refusing to send your API key over plaintext HTTP.',
    );
  }

  const MAX_CHARS = 30_000;
  if (text.length > MAX_CHARS) {
    throw new AIError(
      `Content is too long (${text.length} chars). Please trim it under ${MAX_CHARS} characters.`,
    );
  }

  const prompt = `Create a list of Q&A flashcards based on the following text.
Return ONLY JSON containing an array of objects with "question" and "answer" string properties.
Do not include commentary or Markdown fences.
Text:
${text}`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      },
      body: JSON.stringify({
        model: import.meta.env.VITE_AI_MODEL || 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (response.status === 429) {
      throw new AIError('Rate limit exceeded. Please try again later.', 429);
    }

    if (!response.ok) {
      const detail = typeof response.text === 'function'
        ? await response.text().catch(() => '')
        : '';
      const suffix = detail
        ? `: ${detail.replace(/\s+/g, ' ').slice(0, 200)}`
        : response.statusText
          ? `: ${response.statusText}`
          : '';
      throw new AIError(`API error (${response.status})${suffix}`, response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AIError('The provider returned a response that was not valid JSON.');
    }

    const content = removeCodeFence(extractProviderContent(payload));
    let parsedCards: unknown;
    try {
      parsedCards = JSON.parse(content);
    } catch {
      throw new AIError('The provider message did not contain valid flashcard JSON.');
    }

    const items = firstArray(parsedCards);
    if (!items) {
      throw new AIError('Invalid format returned by AI (expected a JSON array of cards).');
    }

    const MAX_CARDS = 200;
    const cards = toFlashcards(items.slice(0, MAX_CARDS));
    if (items.length > MAX_CARDS) {
      console.warn(`[Denki AI] Provider returned ${items.length} cards; keeping the first ${MAX_CARDS}.`);
    }
    if (cards.length === 0 && items.length > 0) {
      throw new AIError('The provider returned cards without usable question and answer text.');
    }
    return cards;
  } catch (error: unknown) {
    if (error instanceof AIError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AIError('The request timed out. Try shorter content or check your connection.');
    }
    throw new AIError(error instanceof Error ? error.message : 'Failed to generate flashcards');
  } finally {
    window.clearTimeout(timeout);
  }
}
