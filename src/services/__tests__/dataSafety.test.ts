import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { useUIStore } from '../../store/uiStore';
import { maybeNudgeBackup, markBackupExported, _resetDataSafetyForTests } from '../dataSafety';
import type { Card } from '../../db/schema';

const seedCard = (i: number): Card => ({
  classId: 1,
  deckId: 1,
  front: `q${i}`,
  back: `a${i}`,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

describe('dataSafety backup nudge', () => {
  beforeEach(async () => {
    await db.cards.clear();
    localStorage.removeItem('denki-last-backup-export');
    localStorage.removeItem('denki-backup-nudge-at');
    useUIStore.setState({ toasts: [] });
    _resetDataSafetyForTests();
  });

  it('stays quiet below the card threshold', async () => {
    for (let i = 0; i < 5; i++) await db.cards.add(seedCard(i));
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('nudges once when there are many cards and no backup on record', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    await maybeNudgeBackup();
    const toasts = useUIStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('backup');
    // A second call in the same session must not stack another toast
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(1);
  });

  it('stays quiet when a backup was exported recently', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    markBackupExported();
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('stays quiet when a nudge was already shown this week', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    localStorage.setItem('denki-backup-nudge-at', String(Date.now() - 1000));
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });
});
