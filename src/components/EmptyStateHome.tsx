import React, { useState } from 'react';
import { Sparkles, GraduationCap, ArrowRight } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';

/**
 * Empty-state home shown when the user has no classes yet. Replaces the public
 * marketing landing page inside the app: a fresh install should point the user
 * straight at creating their first class and adding cards — not at a demo page.
 */
const EmptyStateHome: React.FC = () => {
  const createClass = useFlashcardStore((s) => s.createClass);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const id = await createClass(name.trim(), description.trim());
      // Navigate into the new class workspace.
      window.location.hash = `#/class/${id}`;
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 24px',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
        }}>
          <GraduationCap size={32} />
        </div>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 8 }}>
          Start a study class
        </h1>
        <p style={{ color: '#8e8e93', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: 32 }}>
          Create your first class to begin building flashcards. Everything is stored
          locally on this device — no account needed.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Class name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dental Anatomy"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#f3f4f6', fontSize: '0.95rem', outline: 'none',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8e8e93', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Description <span style={{ color: '#6b7280', textTransform: 'none' }}>(optional)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you study?"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#f3f4f6', fontSize: '0.95rem', outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            style={{
              marginTop: 8, padding: '14px 24px', borderRadius: 12,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.95rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            {creating ? 'Creating…' : (
              <>
                <Sparkles size={16} /> Create class <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmptyStateHome;
