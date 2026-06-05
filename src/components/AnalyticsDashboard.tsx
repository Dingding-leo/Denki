import React from 'react';
import { Award, Calendar, BarChart2, CheckCircle2, TrendingUp, Layers } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';

export const AnalyticsDashboard: React.FC = () => {
  const globalStats = useFlashcardStore(state => state.globalStats);
  const decks = useFlashcardStore(state => state.decks);

  if (!globalStats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: '#9ca3af', fontSize: '14px' }}>
        <h4>Computing statistics...</h4>
      </div>
    );
  }

  const { totalReviews, currentStreak, maxStreak, avgRecallRate, heatmapData, workloadForecast, cardStates } = globalStats;
  const metrics = { currentStreak, maxStreak, totalReviews, avgRecallRate };
  const totalCards = cardStates.newCount + cardStates.learningCount + cardStates.reviewCount;

  // Heatmap helper for square color classes
  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'rgba(255, 255, 255, 0.03)';
    if (count <= 3) return 'rgba(99, 102, 241, 0.25)'; // Light Indigo
    if (count <= 8) return 'rgba(99, 102, 241, 0.5)';  // Medium Indigo
    if (count <= 15) return 'rgba(99, 102, 241, 0.75)'; // Dark Indigo
    return '#6366f1'; // Full neon Indigo
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '10px 0' }}>
      
      {/* Metric Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
      }}>
        {/* Metric 1 */}
        <div className="card-deck-premium" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', boxShadow: '0 0 10px rgba(99, 102, 241, 0.15)' }}>
            <Award size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: '#8e8e93', fontWeight: 500 }}>Active Streak</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
              {metrics.currentStreak} <span style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>days</span>
            </h3>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="card-deck-premium" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', boxShadow: '0 0 10px rgba(16, 185, 129, 0.15)' }}>
            <Calendar size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: '#8e8e93', fontWeight: 500 }}>Total Reviews</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
              {metrics.totalReviews} <span style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>logs</span>
            </h3>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="card-deck-premium" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', boxShadow: '0 0 10px rgba(59, 130, 246, 0.15)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: '#8e8e93', fontWeight: 500 }}>Retention Accuracy</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
              {metrics.avgRecallRate}%
            </h3>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="card-deck-premium" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', boxShadow: '0 0 10px rgba(245, 158, 11, 0.15)' }}>
            <Layers size={24} />
          </div>
          <div>
            <p style={{ fontSize: '13px', color: '#8e8e93', fontWeight: 500 }}>Total Cards</p>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
              {totalCards} <span style={{ fontSize: '14px', fontWeight: 500, color: '#9ca3af' }}>in {decks.length} decks</span>
            </h3>
          </div>
        </div>
      </div>

      {/* GitHub Style Streaks Heatmap */}
      <div className="card-deck-premium" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} style={{ color: '#6366f1' }} />
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6' }}>Study Calendar (Last 12 Months)</h4>
          </div>
          <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Max Streak: {metrics.maxStreak} days</span>
        </div>

        {/* Scrollable Heatmap Wrap */}
        <div style={{ overflowX: 'auto', paddingBottom: '10px', display: 'flex', gap: '4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280', paddingRight: '8px', height: '90px' }}>
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>

          <div style={{ display: 'flex', gap: '3px' }}>
            {heatmapData.map((week, wIdx) => (
              <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {week.map((day, dIdx) => (
                  <div
                    key={dIdx}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '3px',
                      backgroundColor: getHeatmapColor(day.count),
                      transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                    title={`${day.date}: ${day.count} reviews`}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'scale(1.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
          <span>Less</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.03)' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(99, 102, 241, 0.25)' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(99, 102, 241, 0.5)' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(99, 102, 241, 0.75)' }} />
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#6366f1' }} />
          <span>More</span>
        </div>
      </div>

      {/* Two Column Section for Workloads & Mastery States */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
      }}>
        {/* Forecasts SVG Chart */}
        <div className="card-deck-premium" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={18} style={{ color: '#6366f1' }} />
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6' }}>7-Day Workload Forecast</h4>
          </div>
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '140px', padding: '10px 0' }}>
            {workloadForecast.map((bar, idx) => {
              // Find max bar height for scaling
              const maxCount = Math.max(...workloadForecast.map(w => w.count), 1);
              const heightPct = (bar.count / maxCount) * 100;
              
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: bar.count > 0 ? '#a5b4fc' : '#6b7280' }}>
                    {bar.count}
                  </span>
                  
                  {/* Bar */}
                  <div style={{
                    width: '60%',
                    maxWidth: '24px',
                    height: `${Math.max(4, heightPct * 0.9)}px`,
                    background: bar.count > 0 ? 'linear-gradient(to top, #3b82f6, #6366f1)' : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.5s ease',
                    boxShadow: bar.count > 0 ? '0 0 10px rgba(99, 102, 241, 0.2)' : 'none',
                  }} />
                  
                  <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'capitalize', fontWeight: 500 }}>
                    {bar.dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card Mastery Levels */}
        <div className="card-deck-premium" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} style={{ color: '#10b981' }} />
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6' }}>Card Mastery Breakdown</h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center', flex: 1 }}>
            {/* Progress Segment */}
            <div style={{
              height: '16px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)',
              overflow: 'hidden',
              display: 'flex',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2) inset',
            }}>
              <div style={{ width: `${cardStates.reviewPct}%`, background: 'linear-gradient(90deg, #10b981, #059669)' }} title={`Review Mastery: ${cardStates.reviewCount} cards`} />
              <div style={{ width: `${cardStates.learningPct}%`, background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }} title={`Learning: ${cardStates.learningCount} cards`} />
              <div style={{ width: `${cardStates.newPct}%`, backgroundColor: 'rgba(255,255,255,0.08)' }} title={`New: ${cardStates.newCount} cards`} />
            </div>

            {/* Labels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  <span style={{ color: '#d1d5db' }}>Mastered (Review state)</span>
                </div>
                <span style={{ fontWeight: 600, color: '#f3f4f6' }}>{cardStates.reviewCount} <span style={{ fontSize: '11px', color: '#9ca3af' }}>({cardStates.reviewPct}%)</span></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                  <span style={{ color: '#d1d5db' }}>Learning / Relearning</span>
                </div>
                <span style={{ fontWeight: 600, color: '#f3f4f6' }}>{cardStates.learningCount} <span style={{ fontSize: '11px', color: '#9ca3af' }}>({cardStates.learningPct}%)</span></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }} />
                  <span style={{ color: '#d1d5db' }}>Brand New</span>
                </div>
                <span style={{ fontWeight: 600, color: '#f3f4f6' }}>{cardStates.newCount} <span style={{ fontSize: '11px', color: '#9ca3af' }}>({cardStates.newPct}%)</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

// Cleaned up unused variables
