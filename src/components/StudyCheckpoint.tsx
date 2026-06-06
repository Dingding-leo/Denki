import React from 'react';
import { Sparkles } from 'lucide-react';

interface StudyCheckpointProps {
  completedCount: number;
  currentIndex: number;
  queueLength: number;
  currentStreak: number;
  roundAverages: number[];
  onContinue: () => void;
  onExit: () => void;
}

export const StudyCheckpoint: React.FC<StudyCheckpointProps> = ({
  completedCount,
  currentIndex,
  queueLength,
  currentStreak,
  roundAverages,
  onContinue,
  onExit,
}) => {
  const baseline = roundAverages[0] || 1;
  const currentRoundAvg = roundAverages[roundAverages.length - 1] || 1;
  const percentSlowdown = Math.round(((currentRoundAvg - baseline) / baseline) * 100);

  return (
    <div className="glass-panel" style={{
      textAlign: 'center',
      padding: '40px',
      maxWidth: '540px',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px',
      animation: 'scaleIn 0.3s ease',
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'rgba(245, 158, 11, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f59e0b',
        marginBottom: '6px',
      }}>
        <Sparkles size={26} />
      </div>
      
      <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>Round Checkpoint! 🎯</h2>
      <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.4, maxWidth: '400px' }}>
        Fantastic job! You've successfully prioritized and reviewed **{completedCount} cards** in this session.
      </p>

      <div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'center', margin: '5px 0' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Streak</span>
          <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>🔥 {currentStreak} days</h4>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Queue Progress</span>
          <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#a5b4fc', marginTop: '4px' }}>
            {Math.round((currentIndex / queueLength) * 100)}%
          </h4>
        </div>
      </div>

      {/* Scientific Cognitive Fatigue Tracker */}
      {roundAverages.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '100%',
          padding: '16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          textAlign: 'left',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🧠 Scientific Fatigue Tracker
            </span>
            <span style={{ fontSize: '11px', color: percentSlowdown > 25 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
              {percentSlowdown > 0 ? `+${percentSlowdown}% slowdown` : percentSlowdown < 0 ? `${percentSlowdown}% faster!` : 'Stable Speed'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
            <div>
              <p style={{ fontSize: '10px', color: '#6b7280' }}>Baseline (Round 1)</p>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#d1d5db' }}>{baseline}s<span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280' }}>/card</span></h4>
            </div>
            <div>
              <p style={{ fontSize: '10px', color: '#6b7280' }}>Current (Round {roundAverages.length})</p>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: percentSlowdown > 25 ? '#ef4444' : '#a5b4fc' }}>{currentRoundAvg}s<span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280' }}>/card</span></h4>
            </div>
          </div>

          {/* Recommendation Alert message */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: percentSlowdown > 25 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
            border: `1px solid ${percentSlowdown > 25 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ fontSize: '14px' }}>{percentSlowdown > 25 ? '⚠️' : '✅'}</span>
            <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0, lineHeight: 1.3 }}>
              {percentSlowdown > 25 
                ? 'Cognitive fatigue detected (>25% slowdown). We highly advise pausing for a 5-minute stretch.'
                : 'Optimal recall efficiency. Your brain is in a highly focused state. Keep going!'}
            </p>
          </div>

          {/* Visual historical trend bar chart */}
          {roundAverages.length > 1 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
              <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📈 Performance Speed Curve (seconds/card)
              </span>
              <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                height: '70px',
                gap: '8px',
                padding: '10px 15px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '8px',
              }}>
                {roundAverages.map((avg, idx) => {
                  const maxVal = Math.max(...roundAverages, 1);
                  const heightPct = Math.max(15, (avg / maxVal) * 100);
                  const isLast = idx === roundAverages.length - 1;
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        flex: 1, 
                        height: `${heightPct}%`, 
                        background: isLast ? 'linear-gradient(to top, #6366f1, #818cf8)' : 'rgba(99, 102, 241, 0.3)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                        position: 'relative',
                        boxShadow: isLast ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none',
                      }}
                      title={`Round ${idx + 1}: ${avg}s/card`}
                    >
                      <span style={{
                        position: 'absolute',
                        top: '-15px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '8px',
                        color: '#9ca3af',
                        fontFamily: 'monospace',
                      }}>
                        {avg}s
                      </span>
                      <span style={{
                        position: 'absolute',
                        bottom: '-12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '7px',
                        color: '#4b5563',
                        fontWeight: 700,
                      }}>
                        R{idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onContinue}
        className="btn-premium-primary hover-lift"
        style={{
          width: '100%',
          marginTop: '10px',
          padding: '14px 24px',
          borderRadius: '10px',
          fontSize: '14px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.35)',
        }}
      >
        Continue Studying (Space / Enter)
      </button>
      
      <button
        onClick={onExit}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9ca3af',
          fontSize: '12px',
          cursor: 'pointer',
          padding: '6px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
        onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
      >
        I want to pause & exit
      </button>
    </div>
  );
};
