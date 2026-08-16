import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../db/schema';
import { Flashcard } from '../Flashcard';

class TestUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;

  constructor(text: string) {
    this.text = text;
  }
}

const card = (id: number, front: string, back: string): Card => ({
  id,
  classId: 1,
  deckId: 1,
  front,
  back,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

describe('Flashcard automatic speech', () => {
  const speak = vi.fn();
  const cancel = vi.fn();
  const voice = {
    default: true,
    lang: 'en-US',
    localService: true,
    name: 'Test English',
    voiceURI: 'test-english',
  } as SpeechSynthesisVoice;

  beforeEach(() => {
    vi.useFakeTimers();
    speak.mockReset();
    cancel.mockReset();
    vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getVoices: vi.fn(() => [voice]),
        speak,
        cancel,
      } as unknown as SpeechSynthesis,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    act(() => vi.runOnlyPendingTimers());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the next question instead of its answer during the flipped-to-front transition', () => {
    const first = card(1, 'Question one', 'Answer one');
    const second = card(2, 'Question two', 'Answer two');
    const onFlip = vi.fn();

    const view = render(
      <Flashcard key={first.id} card={first} isFlipped={false} onFlip={onFlip} autoSpeak />,
    );
    act(() => vi.runOnlyPendingTimers());

    view.rerender(
      <Flashcard key={first.id} card={first} isFlipped onFlip={onFlip} autoSpeak />,
    );
    act(() => vi.runOnlyPendingTimers());

    // Reproduce the rating race: the next keyed card briefly receives
    // the old flipped state before StudySessionPage resets the side.
    view.rerender(
      <Flashcard key={second.id} card={second} isFlipped onFlip={onFlip} autoSpeak />,
    );
    view.rerender(
      <Flashcard key={second.id} card={second} isFlipped={false} onFlip={onFlip} autoSpeak />,
    );
    act(() => vi.runOnlyPendingTimers());

    const spoken = speak.mock.calls.map(([utterance]) => (utterance as TestUtterance).text);
    expect(spoken).toEqual(['Question one', 'Answer one', 'Question two']);
    expect(spoken).not.toContain('Answer two');
  });

  it('cancels pending automatic speech when the feature is switched off', () => {
    const current = card(1, 'Question', 'Answer');
    const onFlip = vi.fn();
    const view = render(
      <Flashcard card={current} isFlipped={false} onFlip={onFlip} autoSpeak />,
    );

    view.rerender(
      <Flashcard card={current} isFlipped={false} onFlip={onFlip} autoSpeak={false} />,
    );
    act(() => vi.runOnlyPendingTimers());

    expect(speak).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});
