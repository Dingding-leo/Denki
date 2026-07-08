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

  const prompt = `Create a list of Q&A flashcards based on the following text. 
Return ONLY a JSON array of objects with 'question' and 'answer' string properties.
Do not include markdown blocks or any other text.
Text:
${text}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost', 
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (response.status === 429) {
      throw new AIError('Rate limit exceeded. Please try again later.', 429);
    }

    if (!response.ok) {
      throw new AIError(`API error: ${response.statusText}`, response.status);
    }

    const data = await response.json();
    
    let content = data.choices?.[0]?.message?.content || '[]';
    
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(content);
    
    if (!Array.isArray(parsed)) {
      if (parsed.flashcards && Array.isArray(parsed.flashcards)) {
         return parsed.flashcards.map((f: any) => ({
           id: crypto.randomUUID(),
           question: f.question,
           answer: f.answer,
         }));
      }
      throw new Error('Invalid format returned by AI');
    }

    return parsed.map((item: any) => ({
      id: crypto.randomUUID(),
      question: item.question || '',
      answer: item.answer || '',
    }));
  } catch (err: any) {
    if (err instanceof AIError) throw err;
    throw new AIError(err.message || 'Failed to generate flashcards');
  }
}
