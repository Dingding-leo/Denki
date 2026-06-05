import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useFlashcardStore } from '../../store/useFlashcardStore';

interface CreateClassModalProps {
  onClose: () => void;
  onClassCreated: (classId: number) => void;
}

export const CreateClassModal: React.FC<CreateClassModalProps> = ({ onClose, onClassCreated }) => {
  const store = useFlashcardStore();
  const [newClassName, setNewClassName] = useState('');
  const [newClassDesc, setNewClassDesc] = useState('');

  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    
    const classId = await store.createClass(newClassName.trim(), newClassDesc.trim());
    onClassCreated(classId);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 7, 12, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '460px',
        width: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px', right: '16px',
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6' }}>Create New Study Class</h3>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
            A Class is a high-level course category (e.g. *Computer Science*) containing multiple sub-decks.
          </p>
        </div>

        <form onSubmit={handleCreateClassSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Class Name</label>
            <input
              type="text"
              placeholder="e.g. Medical School, Spanish 101"
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              className="input-premium"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</label>
            <textarea
              rows={3}
              placeholder="Summarize the courses or examinations..."
              value={newClassDesc}
              onChange={e => setNewClassDesc(e.target.value)}
              className="textarea-premium"
            />
          </div>

          <button
            type="submit"
            className="btn-premium-primary"
            style={{ width: '100%', height: '44px', marginTop: '8px' }}
          >
            Create Class Workspace
          </button>
        </form>
      </div>
    </div>
  );
};
