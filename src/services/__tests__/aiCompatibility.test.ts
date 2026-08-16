import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIError, generateFlashcards } from '../ai';

describe('AI provider response compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'compat-id' },
    });
  });

  it('accepts an array of text content parts from OpenAI-compatible providers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: [
              { type: 'text', text: '{"cards":[' },
              { type: 'text', text: '{"question":"Q","answer":"A"}]}' },
            ],
          },
        }],
      }),
    });

    await expect(generateFlashcards('notes', 'key')).resolves.toEqual([
      { id: 'compat-id', question: 'Q', answer: 'A' },
    ]);
  });

  it('reports unsupported or empty message content clearly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: { type: 'image' } } }] }),
    });

    await expect(generateFlashcards('notes', 'key')).rejects.toThrow(AIError);
    await expect(generateFlashcards('notes', 'key')).rejects.toThrow(/unsupported message format/);
  });

  it('distinguishes an invalid provider envelope from invalid flashcard JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: true }),
    });
    await expect(generateFlashcards('notes', 'key')).rejects.toThrow(/choices array/);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    });
    await expect(generateFlashcards('notes', 'key')).rejects.toThrow(/valid flashcard JSON/);
  });
});
