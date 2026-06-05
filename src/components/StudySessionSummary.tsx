import React, { useMemo } from 'react';
import { Award, Timer, CheckCircle, BarChart2 } from 'lucide-react';
import type { StudySessionHistoryEntry } from '../store/types';

interface StudySessionSummaryProps {
  history: StudySessionHistoryEntry[];
  totalTimeSpent: number; // in seconds
  onExit: () => void;
}

export const StudySessionSummary: React.FC<StudySessionSummaryProps> = ({
  history,
  totalTimeSpent,
  onExit,
}) => {
  const stats = useMemo(() => {
    const total = history.length;
    if (total === 0) {
      return {
        total: 0,
        accuracy: 0,
        avgTimePerCard: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    let correctCount = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    history.forEach(entry => {
      distribution[entry.rating] = (distribution[entry.rating] || 0) + 1;
      if (entry.rating >= 3) {
        correctCount++;
      }
    });

    const accuracy = Math.round((correctCount / total) * 100);
    const avgTimePerCard = parseFloat((totalTimeSpent / total).toFixed(1));

    return {
      total,
      accuracy,
      avgTimePerCard,
      distribution,
    };
  }, [history, totalTimeSpent]);

  return (
    <div className="glass-panel" style={{
      textAlign: 'center',
      padding: '40px',
      maxWidth: '640px',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '24px',
      animation: 'scaleIn 0.3s ease',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#10b981',
        boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
      }}>
        <Award size={32} />
      </div>

      <div>
        <h2 className="gradient-text" style={{ fontSize: '26px', fontWeight: 800, marginBottom: '6px' }}>
          Session Completed! 🎉
        </h2>
        <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
          You've completed all due reviews in this session. FSRS stability and difficulty variables have been successfully recalculated.
        </p>
      </div>

      {/* Stats Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', width: '100%' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '16px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <CheckCircle size={18} style={{ color: '#a5b4fc' }} />
          <span style={{ fontSize: '10px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reviewed</span>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#f3f4f6' }}>{stats.total}</h3>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '16px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <BarChart2 size={18} style={{ color: stats.accuracy >= 80 ? '#30d158' : stats.accuracy >= 60 ? '#ff9f0a' : '#ff453a' }} />
          <span style={{ fontSize: '10px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recall Rate</span>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#f3f4f6' }}>{stats.accuracy}%</h3>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '16px 12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <Timer size={18} style={{ color: '#0a84ff' }} />
          <span style={{ fontSize: '10px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Pace</span>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#f3f4f6' }}>{stats.avgTimePerCard}s</h3>
        </div>
      </div>

      {/* Ratings Distribution Chart */}
      {stats.total > 0 && (
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px', textAlign: 'left' }}>
          <h4 style={{ fontSize: '12px', color: '#d1d5db', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
            Confidence Scores Distribution
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {([
              { rating: 5, label: 'Perfect (5)', color: '#3b82f6' },
              { rating: 4, label: 'Very Well (4)', color: '#10b981' },
              { rating: 3, label: 'Moderate (3)', color: '#eab308' },
              { rating: 2, label: 'Slightly (2)', color: '#f97316' },
              { rating: 1, label: 'Not at all (1)', color: '#ef4444' },
            ]).map(item => {
              const count = stats.distribution[item.rating as 1|2|3|4|5] || 0;
              const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={item.rating} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#9ca3af', width: '80px', flexShrink: 0 }}>{item.label}</span>
                  <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: item.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: '#f3f4f6', width: '24px', textAlign: 'right', fontFamily: 'monospace' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onExit}
        style={{
          background: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 32px',
          fontWeight: 600,
          cursor: 'pointer',
          marginTop: '8px',
          boxShadow: '0 4px 15px rgba(99,102,241,0.25)',
        }}
        className="hover-lift"
      >
        Return to Workspace
      </button>
    </div>
  );
};
