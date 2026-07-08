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
});
