import React, { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import type { CardType } from '../../db/schema';
import confetti from 'canvas-confetti';

interface ManageCardsModalProps {
  classId: number;
  deckId: number;
  onClose: () => void;
}

export const ManageCardsModal: React.FC<ManageCardsModalProps> = ({ classId, deckId, onClose }) => {
  const store = useFlashcardStore();
  
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
  const [newCardType, setNewCardType] = useState<CardType>('standard');

  const deck = store.decks.find(d => d.id === deckId);

  const handleCreateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardFront.trim() || !newCardBack.trim()) return;
    
    await store.createCard(classId, deckId, newCardFront.trim(), newCardBack.trim(), newCardType);
    setNewCardFront('');
    setNewCardBack('');
    
    confetti({
      particleCount: 15,
      spread: 20,
      origin: { y: 0.85 },
      colors: ['#6366f1', '#a5b4fc']
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 7, 12, 0.9)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '800px',
        width: '100%',
        height: '90vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        overflowY: 'auto',
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
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6' }}>
            Manage Cards: {deck?.name}
          </h3>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
            Add individual cards or delete existing flashcards from this deck.
          </p>
        </div>

        {/* Split-Face Flashcard Form */}
        <form onSubmit={handleCreateCardSubmit} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc' }}>Quick Card Creator</span>
            <select
              value={newCardType}
              onChange={e => setNewCardType(e.target.value as CardType)}
              style={{ background: '#0a0e17', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', padding: '2px 6px', color: '#f3f4f6', fontSize: '11px' }}
            >
              <option value="standard">Standard</option>
              <option value="cloze">Cloze Deletion</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Question Face (Front)</label>
                {newCardType === 'cloze' && (
                  <span style={{ fontSize: '9px', color: '#6366f1' }}>Wrap blank: {'{{c1::term}}'}</span>
                )}
              </div>
              <textarea
                rows={3}
                placeholder="Provide card question or cloze statement..."
                value={newCardFront}
                onChange={e => setNewCardFront(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '8px 12px', color: '#f3f4f6', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>Answer Face (Back)</label>
              <textarea
                rows={3}
                placeholder="Provide card answer details or markdown..."
                value={newCardBack}
                onChange={e => setNewCardBack(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '8px 12px', color: '#f3f4f6', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            Add Card
          </button>
        </form>

        {/* List of cards inside the managing deck */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', flex: 1, overflowY: 'auto' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>Cards Table ({store.cards.length})</span>
          
          {store.cards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '13px' }}>
              This deck is empty. Add a card above to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {store.cards.map((card, idx) => (
                <div key={card.id} className="glass-panel" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.01)',
                  justifyContent: 'space-between',
                  borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700 }}>
                    {idx + 1}
                  </span>
                  
                  <div style={{ flex: 1, overflow: 'hidden', minWidth: '100px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {card.front}
                    </p>
                  </div>

                  <div style={{ flex: 1, overflow: 'hidden', minWidth: '100px' }}>
                    <p style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {card.back}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', fontSize: '9px', color: '#6b7280', flexShrink: 0, alignItems: 'center' }}>
                    <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 4px', borderRadius: '3px' }}>
                      Diff: {card.difficulty.toFixed(1)}
                    </span>
                    <span style={{ background: 'rgba(255,255,255,0.03)', padding: '2px 4px', borderRadius: '3px' }}>
                      Stab: {card.stability.toFixed(1)}d
                    </span>
                  </div>

                  {/* Manual Confidence Rating Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600 }}>Confidence:</span>
                    <select
                      value={card.id ? (card.lastRating ?? 0) : 0}
                      onChange={async (e) => {
                        if (card.id) {
                          const ratingVal = parseInt(e.target.value, 10);
                          await store.manuallySetCardConfidence(card.id, ratingVal);
                        }
                      }}
                      style={{
                        background: '#0a0e17',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        color: '#d1d5db',
                        fontSize: '11px',
                        fontWeight: 600,
                        outline: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <option value={0}>Unseen (New)</option>
                      <option value={1}>1 - Again (Not at all)</option>
                      <option value={2}>2 - Hard (Slightly)</option>
                      <option value={3}>3 - Good (Moderately)</option>
                      <option value={4}>4 - Easy (Very well)</option>
                      <option value={5}>5 - Perfect (Perfectly)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => card.id && store.deleteCard(card.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6, padding: '4px' }}
                    title="Delete Card"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
