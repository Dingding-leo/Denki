import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { LearnMode } from '../LearnMode';
import { MatchGame } from '../MatchGame';
import { StudyNotepad } from '../StudyNotepad';

const newCard = (classId: number, deckId: number, front: string): Card => ({
  classId,
  deckId,
  front,
  back: `Answer: ${front}`,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

describe('React 19 interaction state', () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    useFlashcardStore.setState({
      session: null,
      decks: [],
      classes: [],
      activeDeckId: null,
      activeClassId: null,
    });
  });

  it('reinitializes deck notes when the deck changes without a syncing effect', () => {
    localStorage.setItem('denki-notes-1', '# First deck');
    localStorage.setItem('denki-notes-2', '# Second deck');

    const { rerender } = render(<StudyNotepad deckId={1} deckName="One" />);
    expect(screen.getByRole('heading', { name: 'First deck' })).toBeInTheDocument();

    rerender(<StudyNotepad deckId={2} deckName="Two" />);
    expect(screen.getByRole('heading', { name: 'Second deck' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'First deck' })).not.toBeInTheDocument();
  });

  it('keeps global Learn Mode shortcuts safe when no session exists', () => {
    const onExit = vi.fn();
    render(<LearnMode onExit={onExit} />);

    expect(() => fireEvent.keyDown(window, { key: 'Enter' })).not.toThrow();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('uses loaded card state to show the Match Game minimum-card guard', async () => {
    const classId = await db.classes.add({
      name: 'Biology',
      description: '',
      createdAt: new Date(),
    });
    const deckId = await db.decks.add({
      classId,
      name: 'Cells',
      description: '',
      createdAt: new Date(),
    });
    await db.cards.bulkAdd([
      newCard(classId, deckId, 'Cell membrane'),
      newCard(classId, deckId, 'Nucleus'),
    ]);
    useFlashcardStore.setState({
      decks: [{ id: deckId, classId, name: 'Cells', description: '', createdAt: new Date() }],
    });

    render(<MatchGame deckId={deckId} />);

    expect(await screen.findByText('Not Enough Cards')).toBeInTheDocument();
  });
});
