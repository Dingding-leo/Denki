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

/** Pull the first array out of a parsed AI response: a bare array, or the first
 *  array-valued property of an object (flashcards / cards / items / …). */
function firstArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) if (Array.isArray(v)) return v;
  }
  return null;
}

/** Keep only well-formed cards (non-empty string question AND answer). A model
 *  that returns a non-string field would otherwise be stored and later crash the
 *  markdown renderer ("text.replace is not a function") when the card is studied. */
function toFlashcards(items: unknown[]): Flashcard[] {
  const cards: Flashcard[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const q = (item as Record<string, unknown>).question;
    const a = (item as Record<string, unknown>).answer;
    if (typeof q === 'string' && typeof a === 'string' && q.trim() && a.trim()) {
      cards.push({ id: crypto.randomUUID(), question: q.trim(), answer: a.trim() });
    }
  }
  return cards;
}

export async function generateFlashcards(
  text: string,
  apiKey: string,
  apiUrl: string = import.meta.env.VITE_AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions'
): Promise<Flashcard[]> {
  if (!apiKey) {
    throw new AIError('API key is required. Please configure it in settings.');
  }

  if (!text.trim()) {
    throw new AIError('Content cannot be empty.');
  }

  const MAX_CHARS = 30000;
  if (text.length > MAX_CHARS) {
    throw new AIError(`Content is too long (${text.length} chars). Please trim it under ${MAX_CHARS} characters.`);
  }

  const prompt = `Create a list of Q&A flashcards based on the following text.
Return ONLY a JSON array of objects with 'question' and 'answer' string properties.
Do not include markdown blocks or any other text.
Text:
${text}`;

  // Abort the request after 60s so a hung provider doesn't leave the UI stuck.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
      },
      body: JSON.stringify({
        model: import.meta.env.VITE_AI_MODEL || 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    });

    if (response.status === 429) {
      throw new AIError('Rate limit exceeded. Please try again later.', 429);
    }

    if (!response.ok) {
      const detail = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
      const suffix = detail ? `: ${detail.slice(0, 200)}` : response.statusText ? `: ${response.statusText}` : '';
      throw new AIError(`API error (${response.status})${suffix}`, response.status);
    }

    const data = await response.json();
    
    let content = data.choices?.[0]?.message?.content || '[]';
    
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(content);
    const items = firstArray(parsed);
    if (!items) {
      throw new AIError('Invalid format returned by AI (expected a JSON array of cards).');
    }

    return toFlashcards(items);
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIError('The request timed out. Try shorter content or check your connection.');
    }
    const message = err instanceof Error ? err.message : 'Failed to generate flashcards';
    throw new AIError(message);
  } finally {
    clearTimeout(timeout);
  }
}
