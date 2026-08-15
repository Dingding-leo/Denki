import { useEffect } from 'react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { TodayQueueCard } from '../components/TodayQueueCard';
import EmptyStateHome from '../components/EmptyStateHome';
import { celebrate } from '../services/celebrate';

export const DashboardPage: React.FC = () => {
  const classes = useFlashcardStore((state) => state.classes);
  const createClass = useFlashcardStore((state) => state.createClass);
  const createDeck = useFlashcardStore((state) => state.createDeck);
  const createCard = useFlashcardStore((state) => state.createCard);

  // The desk always shows global statistics, even after returning from a
  // class-scoped study session.
  useEffect(() => {
    void useFlashcardStore.getState().loadStats(null);
  }, []);

  const seedDefaultDecks = async () => {
    const csClassId = await createClass(
      'Advanced Computer Science',
      'Advanced principles of JS engines, compiler structures, and Gang of Four system patterns.',
    );

    const tsDeckId = await createDeck(
      csClassId,
      'TypeScript & JS Engine Mechanics',
      'Advanced microtask queues, closure spaces, intersection types, and structural bindings.',
    );

    await createCard(
      csClassId,
      tsDeckId,
      'Explain the core difference between the **Microtask Queue** and the **Macrotask Queue** in the JS Event Loop.',
      '**Microtasks** are executed *after* the current execution context script finishes and *before* yielding control back to the event loop (before rendering).\n- **Examples**: `Promise.then`, `queueMicrotask`, `MutationObserver`.\n\n**Macrotasks** are executed sequentially, one per event loop cycle, after the event loop yields control.\n- **Examples**: `setTimeout`, `setInterval`, `setImmediate`, I/O operations.',
      'standard',
    );

    await createCard(
      csClassId,
      tsDeckId,
      'In TypeScript, what is the type evaluation of `type T = string & number`?',
      'The type evaluation is `never`.\n\nSince no value can simultaneously be a `string` and a `number`, the intersection results in an empty type set (`never`).',
      'standard',
    );

    await createCard(
      csClassId,
      tsDeckId,
      "TypeScript utilizes a {{c1::structural}} type system, which differs from Java's {{c2::nominal}} typing model.",
      '1. **Structural Typing (Duck Typing)**: Types are evaluated solely on their shape/members. If two objects have the same shape, they are compatible.\n2. **Nominal Typing**: Type compatibility is defined explicitly by class name and declarations.',
      'cloze',
    );

    const patternDeckId = await createDeck(
      csClassId,
      'Software Design Patterns',
      'Gang of Four behavioural structures and decoupled architecture axioms.',
    );

    await createCard(
      csClassId,
      patternDeckId,
      'What are the 5 principles defined by the **SOLID** acronym?',
      '- **S**: **Single Responsibility Principle** (A module should have one, and only one, reason to change).\n- **O**: **Open/Closed Principle** (Software entities should be open for extension, but closed for modification).\n- **L**: **Liskov Substitution Principle** (Subtypes must be substitutable for their base types without altering correctness).\n- **I**: **Interface Segregation Principle** (Clients should not be forced to depend on methods they do not use).\n- **D**: **Dependency Inversion Principle** (High-level modules should not depend on low-level modules; both should depend on abstractions).',
      'standard',
    );

    await createCard(
      csClassId,
      patternDeckId,
      'The {{c1::Decorator}} design pattern allows dynamically adding behaviours to an object without subclassing.',
      '**Decorator Pattern**: Standard structural pattern that wraps an existing component class and forwards calls, intercepting them to add functionality.',
      'cloze',
    );

    const languageClassId = await createClass(
      'Español Intermedio (Spanish 101)',
      'Expand conversational verbs, tenses, and standard structural expressions.',
    );

    const languageDeckId = await createDeck(
      languageClassId,
      'Verbos Comunes & Idioms',
      'Review high-frequency Spanish verbs and tenses.',
    );

    await createCard(
      languageClassId,
      languageDeckId,
      'What does the verb **Entender** mean, and how does it conjugate in the present *yo* form?',
      '**Entender** means *to understand*.\n\nIt is a stem-changing verb (e → ie):\n- *Yo* conjugation: **Entiendo**.',
      'standard',
    );

    await createCard(
      languageClassId,
      languageDeckId,
      'Convert: "I would like a coffee" into Spanish:\n\nMe {{c1::gustaría}} un café.',
      'Uses the conditional form of *gustar* to express polite requests.',
      'cloze',
    );

    celebrate({ particleCount: 70, spread: 55, origin: { y: 0.7 } });
  };

  return (
    <section className="zine-page zine-dashboard-page">
      <header className="zine-masthead">
        <div>
          <p className="zine-kicker">Denki / Field Notes / Issue 01</p>
          <h1 className="zine-page-title">The Study Desk</h1>
          <p className="zine-page-deck">
            Your local learning archive: what is due, what is sticking, and where the next session should begin.
            No feeds, no accounts, no decorative productivity theatre.
          </p>
        </div>

        <aside className="zine-issue-stamp" aria-label="Application edition">
          <span>Local edition<br />Offline first</span>
          <strong>{String(classes.length).padStart(2, '0')} FILES</strong>
          <span>Updated live<br />on this device</span>
        </aside>
      </header>

      {classes.length === 0 ? (
        <>
          <div className="zine-dashboard-actions">
            <button type="button" onClick={seedDefaultDecks} className="btn-premium-secondary">
              Load sample issue
            </button>
          </div>
          <EmptyStateHome />
        </>
      ) : (
        <>
          <TodayQueueCard />
          <AnalyticsDashboard />
        </>
      )}
    </section>
  );
};
