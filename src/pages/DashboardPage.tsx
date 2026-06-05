import React from 'react';
import { Sparkles, FolderOpen } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import confetti from 'canvas-confetti';

export const DashboardPage: React.FC = () => {
  const store = useFlashcardStore();

  const seedDefaultDecks = async () => {
    // 1. Create Computer Science class
    const csClassId = await store.createClass(
      'Advanced Computer Science',
      'Advanced principles of JS engines, compiler structures, and Gang of Four system patterns.'
    );

    // 1a. Create TypeScript deck
    const tsDeckId = await store.createDeck(
      csClassId,
      'TypeScript & JS Engine Mechanics',
      'Advanced microtask queues, closure spaces, intersection types, and structural bindings.'
    );

    await store.createCard(
      csClassId,
      tsDeckId,
      'Explain the core difference between the **Microtask Queue** and the **Macrotask Queue** in the JS Event Loop.',
      '**Microtasks** are executed *after* the current execution context script finishes and *before* yielding control back to the event loop (before rendering).\n- **Examples**: `Promise.then`, `queueMicrotask`, `MutationObserver`.\n\n**Macrotasks** are executed sequentially, one per event loop cycle, after the event loop yields control.\n- **Examples**: `setTimeout`, `setInterval`, `setImmediate`, I/O operations.',
      'standard'
    );

    await store.createCard(
      csClassId,
      tsDeckId,
      'In TypeScript, what is the type evaluation of `type T = string & number`?',
      'The type evaluation is `never`.\n\nSince no value can simultaneously be a `string` and a `number`, the intersection results in an empty type set (`never`).',
      'standard'
    );

    await store.createCard(
      csClassId,
      tsDeckId,
      'TypeScript utilizes a {{c1::structural}} type system, which differs from Java\'s {{c2::nominal}} typing model.',
      '1. **Structural Typing (Duck Typing)**: Types are evaluated solely on their shape/members. If two objects have the same shape, they are compatible.\n2. **Nominal Typing**: Type compatibility is defined explicitly by class name and declarations.',
      'cloze'
    );

    // 1b. Create Architecture deck
    const patternDeckId = await store.createDeck(
      csClassId,
      'Software Design Patterns',
      ' Gang of Four behavioral structures and decoupled architecture axioms.'
    );

    await store.createCard(
      csClassId,
      patternDeckId,
      'What are the 5 principles defined by the **SOLID** acronym?',
      '- **S**: **Single Responsibility Principle** (A module should have one, and only one, reason to change).\n- **O**: **Open/Closed Principle** (Software entities should be open for extension, but closed for modification).\n- **L**: **Liskov Substitution Principle** (Subtypes must be substitutable for their base types without altering correctness).\n- **I**: **Interface Segregation Principle** (Clients should not be forced to depend on methods they do not use).\n- **D**: **Dependency Inversion Principle** (High-level modules should not depend on low-level modules; both should depend on abstractions).',
      'standard'
    );

    await store.createCard(
      csClassId,
      patternDeckId,
      'The {{c1::Decorator}} design pattern allows dynamically adding behaviors to an object without subclassing.',
      '**Decorator Pattern**: Standard structural pattern that wraps an existing component class and forwards calls, intercepting them to add functionality.',
      'cloze'
    );

    // 2. Create Spanish Vocabulary class
    const langClassId = await store.createClass(
      'Español Intermedio (Spanish 101)',
      'Expand conversational verbs, tenses, and standard structural expressions.'
    );

    const langDeckId = await store.createDeck(
      langClassId,
      'Verbos Comunes & Idioms',
      'Review high-frequency Spanish verbs and tenses.'
    );

    await store.createCard(
      langClassId,
      langDeckId,
      'What does the verb **Entender** mean, and how does it conjugate in the present *yo* form?',
      '**Entender** means *to understand*.\n\nIt is a stem-changing verb (e -> ie):\n- *Yo* conjugation: **Entiendo**.',
      'standard'
    );

    await store.createCard(
      langClassId,
      langDeckId,
      'Convert: "I would like a coffee" into Spanish:\n\nMe {{c1::gustaría}} un café.',
      'Uses the conditional form of *gustar* to express polite requests.',
      'cloze'
    );

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.5px' }}>Global Dashboard</h1>
          <p style={{ color: '#8e8e93', fontSize: '14px', marginTop: '4px' }}>Analyze aggregate class statistics and daily learning streak.</p>
        </div>
        
        {store.classes.length === 0 && (
          <button
            onClick={seedDefaultDecks}
            style={{
              background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(10, 132, 255, 0.2)',
            }}
            className="hover-lift"
          >
            <Sparkles size={16} /> Seed Default Decks
          </button>
        )}
      </div>
      
      {store.classes.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <FolderOpen size={48} style={{ color: '#636366' }} />
          <h3 style={{ fontSize: '18px', color: '#ffffff', fontWeight: 600 }}>Welcome to Denki!</h3>
          <p style={{ color: '#8e8e93', maxWidth: '400px', fontSize: '14px', lineHeight: 1.5 }}>
            Get started by seeding our curated Computer Science and Spanish learning workspaces, or create your own custom Class in the sidebar.
          </p>
          <button
            onClick={seedDefaultDecks}
            style={{
              background: 'rgba(10, 132, 255, 0.1)',
              border: '1px solid rgba(10, 132, 255, 0.4)',
              color: '#0a84ff',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            className="hover-lift"
          >
            Seed Interactive Learning Materials
          </button>
        </div>
      ) : (
        <AnalyticsDashboard />
      )}
    </div>
  );
};
