import React, { useEffect, useState } from 'react';
import { X, Edit2 } from 'lucide-react';

interface EditEntityModalProps {
  title: string;                 // e.g. "Edit Class" / "Edit Deck"
  namePlaceholder: string;
  initialName: string;
  initialDescription: string;
  onSave: (name: string, description: string) => void | Promise<void>;
  onClose: () => void;
}

/** Small shared modal for renaming a class or deck and editing its description. */
export const EditEntityModal: React.FC<EditEntityModalProps> = ({
  title,
  namePlaceholder,
  initialName,
  initialDescription,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, saving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(name.trim(), description.trim());
      onClose();
    } catch {
      setSaveError('The changes could not be saved. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (!saving) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entity-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
      }}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(24, 24, 27, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          animation: 'slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)' }}>
            <Edit2 size={16} />
            <h3 id="edit-entity-title" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={17} />
          </button>
        </div>

        <div>
          <label htmlFor="edit-entity-name" style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Name
          </label>
          <input
            id="edit-entity-name"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={namePlaceholder}
            className="input-premium"
            required
          />
        </div>

        <div>
          <label htmlFor="edit-entity-description" style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Description
          </label>
          <textarea
            id="edit-entity-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description…"
            className="textarea-premium"
            rows={3}
          />
        </div>

        {saveError && (
          <p role="alert" style={{ margin: 0, color: '#fca5a5', fontSize: '12px' }}>
            {saveError}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-premium-secondary"
            style={{ height: '36px', padding: '0 16px', fontSize: '13px' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="btn-premium-primary"
            style={{ height: '36px', padding: '0 18px', fontSize: '13px' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
