import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';

/** A first-run cover spread that leads directly into creating a real class. */
const EmptyStateHome: React.FC = () => {
  const createClass = useFlashcardStore((state) => state.createClass);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || creating) return;

    setCreating(true);
    try {
      const id = await createClass(name.trim(), description.trim());
      window.location.hash = `#/class/${id}`;
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="zine-empty-state">
      <section className="zine-empty-cover" aria-labelledby="first-class-heading">
        <p className="zine-caption">Vol. 01 / Build your archive</p>
        <h2 id="first-class-heading">Start with one class.</h2>
        <p>
          A class is the folder for a subject. Add decks inside it, write or import cards, then let Denki schedule the next review.
          Everything stays on this device.
        </p>
      </section>

      <section className="zine-empty-form">
        <p className="zine-section-kicker">New file / 001</p>
        <h3>Create a class</h3>
        <p className="zine-page-deck">
          Name the subject plainly. You can change the title and description later.
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            <span className="zine-field-label">Class name / required</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Dental anatomy"
            />
          </label>

          <label>
            <span className="zine-field-label">Margin note / optional</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in this class?"
            />
          </label>

          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="btn-premium-primary"
          >
            {creating ? 'Filing…' : 'Create the first file'}
            {!creating && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </form>
      </section>
    </div>
  );
};

export default EmptyStateHome;
