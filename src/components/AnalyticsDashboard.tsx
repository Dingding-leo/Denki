import React from 'react';
import { useFlashcardStore } from '../store/useFlashcardStore';

interface AnalyticsDashboardProps {
  /** 'global' = all classes. 'class' = the currently selected class. */
  scope?: 'global' | 'class';
}

const HEATMAP_COLORS = ['#25231f', '#5d2d24', '#9f3f2d', '#dc5b3b', '#f1ead9'] as const;

function heatmapColor(count: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  if (count <= 3) return HEATMAP_COLORS[1];
  if (count <= 8) return HEATMAP_COLORS[2];
  if (count <= 15) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ scope = 'global' }) => {
  const globalStats = useFlashcardStore((state) => state.globalStats);
  const decks = useFlashcardStore((state) => state.decks);

  if (!globalStats) {
    return (
      <div className="zine-sheet" role="status">
        <p className="zine-section-kicker">Archive desk</p>
        <h3 className="zine-sheet-title">Counting marks in the margins…</h3>
      </div>
    );
  }

  const {
    totalReviews,
    currentStreak,
    maxStreak,
    avgRecallRate,
    heatmapData,
    workloadForecast,
    cardStates,
  } = globalStats;

  const totalCards = cardStates.newCount + cardStates.learningCount + cardStates.reviewCount;
  const maxForecast = Math.max(...workloadForecast.map((day) => day.count), 1);
  const streakLabel = scope === 'class' ? 'This class / current run' : 'Current study run';

  const metrics = [
    {
      index: '01',
      label: streakLabel,
      value: currentStreak,
      unit: currentStreak === 1 ? 'day in sequence' : 'days in sequence',
    },
    {
      index: '02',
      label: 'Review archive',
      value: totalReviews,
      unit: 'review marks / last 12 months',
    },
    {
      index: '03',
      label: 'Good-or-better rate',
      value: `${avgRecallRate}%`,
      unit: 'Good or Easy ratings / last 12 months',
    },
    {
      index: '04',
      label: 'Cards on file',
      value: totalCards,
      unit: `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'} in this view`,
    },
  ];

  return (
    <div className="zine-analytics">
      <section aria-labelledby="desk-numbers-heading">
        <div className="zine-section-heading">
          <span className="zine-section-number">01</span>
          <h2 id="desk-numbers-heading">Desk numbers</h2>
        </div>

        <div className="zine-metrics-grid">
          {metrics.map((metric) => (
            <article className="zine-metric" key={metric.index}>
              <div className="zine-metric-index">
                <span>No. {metric.index}</span>
                <span>{metric.label}</span>
              </div>
              <div>
                <div className="zine-metric-value">{metric.value}</div>
                <p className="zine-metric-unit">{metric.unit}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="zine-sheet" aria-labelledby="study-archive-heading">
        <header className="zine-sheet-header">
          <div>
            <p className="zine-section-kicker">02 / Attendance archive</p>
            <h2 className="zine-sheet-title" id="study-archive-heading">365 days of study marks</h2>
          </div>
          <p className="zine-sheet-note">Longest run in this window<br />{maxStreak} days</p>
        </header>

        <div className="zine-heatmap-wrap">
          <div className="zine-heatmap-days" aria-hidden="true">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>

          <div className="zine-heatmap" aria-label="Review activity over the last twelve months">
            {heatmapData.map((week, weekIndex) => (
              <div className="zine-heatmap-week" key={weekIndex}>
                {week.map((day) => (
                  <div
                    className="zine-heatmap-cell"
                    key={day.date}
                    style={{ backgroundColor: heatmapColor(day.count) }}
                    title={`${day.date}: ${day.count} reviews`}
                    aria-label={`${day.date}: ${day.count} reviews`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="zine-legend" aria-label="Heatmap intensity legend">
          <span>Quiet</span>
          {HEATMAP_COLORS.map((color) => (
            <span className="zine-legend-swatch" style={{ backgroundColor: color }} key={color} />
          ))}
          <span>Heavy</span>
        </div>
      </section>

      <div className="zine-sheet-grid">
        <section className="zine-sheet is-paper" aria-labelledby="workload-heading">
          <header className="zine-sheet-header">
            <div>
              <p className="zine-section-kicker">03 / Next seven days</p>
              <h2 className="zine-sheet-title" id="workload-heading">Workload proof</h2>
            </div>
            <p className="zine-sheet-note">Overdue cards fold<br />into today</p>
          </header>

          <div className="zine-bars">
            {workloadForecast.map((day) => {
              const height = day.count === 0 ? 4 : Math.max(12, (day.count / maxForecast) * 145);
              return (
                <div className="zine-bar-column" key={day.dayName}>
                  <span className="zine-bar-value">{day.count}</span>
                  <div
                    className="zine-bar"
                    style={{ height: `${height}px` }}
                    title={`${day.dayName}: ${day.count} cards`}
                  />
                  <span className="zine-bar-label">{day.dayName}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="zine-sheet" aria-labelledby="card-state-heading">
          <header className="zine-sheet-header">
            <div>
              <p className="zine-section-kicker">04 / Card states</p>
              <h2 className="zine-sheet-title" id="card-state-heading">Scheduling states</h2>
            </div>
            <p className="zine-sheet-note">{totalCards} cards<br />total</p>
          </header>

          <div className="zine-mastery-strip" aria-label="Card-state proportions">
            <div style={{ width: `${cardStates.reviewPct}%` }} title={`${cardStates.reviewCount} review cards`} />
            <div style={{ width: `${cardStates.learningPct}%` }} title={`${cardStates.learningCount} learning cards`} />
            <div style={{ width: `${cardStates.newPct}%` }} title={`${cardStates.newCount} new cards`} />
          </div>

          <div className="zine-stat-list">
            <div className="zine-stat-row">
              <span className="zine-stat-dot" style={{ color: 'var(--zine-highlight)' }} />
              <span>Review state / long-term schedule</span>
              <strong>{cardStates.reviewCount} · {cardStates.reviewPct}%</strong>
            </div>
            <div className="zine-stat-row">
              <span className="zine-stat-dot" style={{ color: 'var(--zine-accent)' }} />
              <span>Learning or relearning</span>
              <strong>{cardStates.learningCount} · {cardStates.learningPct}%</strong>
            </div>
            <div className="zine-stat-row">
              <span className="zine-stat-dot" style={{ color: 'var(--zine-dim)' }} />
              <span>New / not introduced</span>
              <strong>{cardStates.newCount} · {cardStates.newPct}%</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
