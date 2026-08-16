import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, CardType } from '../../db/schema';
import { SPEECH_SPEED_KEY } from '../../services/speech';
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

const card = (
  id: number,
  front: string,
  back: string,
  cardType: CardType = 'standard',
): Card => ({
  id,
  classId: 1,
  deckId: 1,
  front,
  back,
  cardType,
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
    localStorage.clear();
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

  it('never reveals a hidden cloze answer aloud and reads it after the card is flipped', () => {
    const cloze = card(
      1,
      'ATP is produced by the {{c1::mitochondrion::organelle}}.',
      'Known as the powerhouse of the cell.',
      'cloze',
    );
    const onFlip = vi.fn();
    const view = render(
      <Flashcard card={cloze} isFlipped={false} onFlip={onFlip} autoSpeak />,
    );
    act(() => vi.runOnlyPendingTimers());

    const question = (speak.mock.calls[0][0] as TestUtterance).text;
    expect(question.toLowerCase()).toContain('blank');
    expect(question.toLowerCase()).toContain('organelle');
    expect(question.toLowerCase()).not.toContain('mitochondrion');

    view.rerender(<Flashcard card={cloze} isFlipped onFlip={onFlip} autoSpeak />);
    act(() => vi.runOnlyPendingTimers());

    const answer = (speak.mock.calls[1][0] as TestUtterance).text;
    expect(answer).toContain('mitochondrion');
    expect(answer).toContain('powerhouse of the cell');
  });

  it('clamps a corrupt saved speech speed before creating the utterance', () => {
    localStorage.setItem(SPEECH_SPEED_KEY, '99');
    render(<Flashcard card={card(1, 'Question', 'Answer')} isFlipped={false} onFlip={vi.fn()} autoSpeak />);
    act(() => vi.runOnlyPendingTimers());

    expect((speak.mock.calls[0][0] as TestUtterance).rate).toBe(2);
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
