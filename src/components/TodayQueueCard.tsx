import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Layers3, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../store/useFlashcardStore';

export const TodayQueueCard: React.FC = () => {
  const navigate = useNavigate();
  const globalStats = useFlashcardStore((state) => state.globalStats);
  const classes = useFlashcardStore((state) => state.classes);
  const startGlobalStudySession = useFlashcardStore((state) => state.startGlobalStudySession);
  const [starting, setStarting] = useState(false);

  const totals = useMemo(() => {
    const states = globalStats?.cardStates;
    return {
      dueToday: globalStats?.workloadForecast[0]?.count ?? 0,
      dueTomorrow: globalStats?.workloadForecast[1]?.count ?? 0,
      totalCards: states
        ? states.newCount + states.learningCount + states.reviewCount
        : 0,
    };
  }, [globalStats]);

  const hasCards = totals.totalCards > 0;
  const isCaughtUp = totals.dueToday === 0;
  const forceCram = isCaughtUp && hasCards;

  const handleStart = async () => {
    if (!hasCards || starting) return;
    setStarting(true);
    try {
      await startGlobalStudySession(forceCram);
      navigate('/study/all');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className={`today-queue-card ${isCaughtUp ? 'is-clear' : ''}`} aria-labelledby="today-queue-title">
      <div className="today-queue-body">
        <div className="today-queue-kicker">
          <span>00 / Today's queue</span>
          <span className="today-queue-status">
            {isCaughtUp ? <CheckCircle2 size={12} /> : <span className="today-queue-pulse" />}
            {isCaughtUp ? 'Schedule clear' : 'Ready now'}
          </span>
        </div>

        <div className="today-queue-headline">
          <strong className="today-queue-count">{String(totals.dueToday).padStart(2, '0')}</strong>
          <div>
            <h2 id="today-queue-title">
              {isCaughtUp ? 'Nothing due. Keep the rhythm.' : 'Review everything due.'}
            </h2>
            <p>
              {isCaughtUp
                ? 'Your scheduled work is complete. Start an optional mixed practice round, or leave the cards to rest.'
                : 'One randomized session across every class and deck, while Denki preserves each card’s FSRS schedule.'}
            </p>
          </div>
        </div>

        <div className="today-queue-facts">
          <span><Shuffle size={13} /> Fresh random order</span>
          <span><Layers3 size={13} /> {classes.length} {classes.length === 1 ? 'class' : 'classes'} mixed</span>
          <span><Clock3 size={13} /> {totals.dueTomorrow} due tomorrow</span>
        </div>
      </div>

      <aside className="today-queue-ticket">
        <span className="today-queue-ticket-label">Daily review slip</span>
        <div className="today-queue-ticket-number">
          {hasCards ? totals.totalCards : '—'}
          <small>cards on file</small>
        </div>
        <button
          type="button"
          onClick={() => { void handleStart(); }}
          disabled={!hasCards || starting}
          className="today-queue-start"
        >
          {starting
            ? 'Building queue…'
            : !hasCards
              ? 'Add cards first'
              : forceCram
                ? 'Optional mixed practice'
                : `Start ${totals.dueToday}-card review`}
          {!starting && hasCards && <ArrowRight size={15} />}
        </button>
        <span className="today-queue-ticket-note">
          {forceCram ? 'Cram mode · schedules still update' : 'Due cards only · new-card limits apply'}
        </span>
      </aside>
    </section>
  );
};
