import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFlashcards, AIError } from '../ai';

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-1234'
  }
});

vi.stubEnv('VITE_AI_API_URL', 'https://api.test/completions');

describe('generateFlashcards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws if API key is missing', async () => {
    await expect(generateFlashcards('text', '')).rejects.toThrow(AIError);
  });

  it('throws if text is empty', async () => {
    await expect(generateFlashcards('', 'key')).rejects.toThrow(AIError);
  });

  it('throws on rate limit', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    });

    await expect(generateFlashcards('some text', 'key')).rejects.toThrow('Rate limit exceeded');
  });

  it('parses valid AI response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '[{"question": "Q1", "answer": "A1"}]'
            }
          }
        ]
      })
    });

    const result = await generateFlashcards('some text', 'key');
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Q1');
    expect(result[0].answer).toBe('A1');
    expect(result[0].id).toBe('test-uuid-1234');
  });

  const mockContent = (content: string) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    });
  };

  it('filters out cards with non-string or empty fields (and trims)', async () => {
    mockContent(
      JSON.stringify([
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: null },
        { question: '', answer: 'A3' },
        { answer: 'only answer' },
        { question: '  Q5  ', answer: '  A5  ' },
      ]),
    );
    const result = await generateFlashcards('some text', 'key');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ question: 'Q1', answer: 'A1' });
    expect(result[1]).toMatchObject({ question: 'Q5', answer: 'A5' });
  });

  it('accepts an object that wraps the array under any key (e.g. { cards: [...] })', async () => {
    mockContent('{"cards": [{"question": "Q1", "answer": "A1"}]}');
    const result = await generateFlashcards('some text', 'key');
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Q1');
  });

  it('throws AIError when the response has no array of cards', async () => {
    mockContent('{"note": "no array here"}');
    await expect(generateFlashcards('some text', 'key')).rejects.toThrow(AIError);
  });

  it('rejects content over the size cap', async () => {
    await expect(generateFlashcards('x'.repeat(30001), 'key')).rejects.toThrow(/too long/i);
  });

  it('surfaces the provider error body on a non-429 failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    });
    await expect(generateFlashcards('some text', 'key')).rejects.toThrow(/invalid api key/);
  });
});
