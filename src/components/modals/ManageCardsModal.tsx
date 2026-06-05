import React, { useState, useEffect } from 'react';
import { X, Trash2, Edit2, ChevronDown, ChevronRight, Check, Search, Bold, Italic, Code, Brackets } from 'lucide-react';
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

  // Accordion & Inline Editing State
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editCardType, setEditCardType] = useState<CardType>('standard');
  const [searchQuery, setSearchQuery] = useState('');

  const deck = store.decks.find(d => d.id === deckId);

  // Load cards for this deck on mount or when deckId changes
  useEffect(() => {
    store.loadCards(deckId);
  }, [deckId]);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

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
      colors: ['#0a84ff', '#5e5ce6']
    });
  };

  const handleStartEdit = (card: any) => {
    setEditingCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditCardType(card.cardType);
  };

  const handleSaveEdit = async (cardId: number) => {
    if (!editFront.trim() || !editBack.trim()) return;
    await store.updateCard(cardId, editFront.trim(), editBack.trim(), editCardType);
    setEditingCardId(null);
    
    confetti({
      particleCount: 10,
      spread: 15,
      origin: { y: 0.85 },
      colors: ['#30d158', '#34c759']
    });
  };

  const getCardStateLabel = (state: number) => {
    switch (state) {
      case 0: return 'New';
      case 1: return 'Learning';
      case 2: return 'Review';
      case 3: return 'Relearning';
      default: return 'New';
    }
  };

  const insertFormatting = (
    field: 'front' | 'back',
    formatStart: string,
    formatEnd: string,
    isEdit: boolean = false
  ) => {
    const elementId = isEdit ? `edit-${field}` : `new-${field}`;
    const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = isEdit ? (field === 'front' ? editFront : editBack) : (field === 'front' ? newCardFront : newCardBack);
    
    const selectedText = currentVal.substring(start, end);
    const newVal = currentVal.substring(0, start) + formatStart + selectedText + formatEnd + currentVal.substring(end);

    if (isEdit) {
      if (field === 'front') setEditFront(newVal);
      else setEditBack(newVal);
    } else {
      if (field === 'front') setNewCardFront(newVal);
      else setNewCardBack(newVal);
    }

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + formatStart.length, end + formatStart.length);
    }, 0);
  };

  const toolbarBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#8e8e93',
    cursor: 'pointer',
    padding: '3px 6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  };

  const FormatToolbar = ({ field, isEdit }: { field: 'front' | 'back', isEdit?: boolean }) => (
    <div style={{ display: 'flex', gap: '3px' }}>
      {([
        { label: 'Bold', icon: <Bold size={12} />, start: '**', end: '**', color: '#8e8e93' },
        { label: 'Italic', icon: <Italic size={12} />, start: '*', end: '*', color: '#8e8e93' },
        { label: 'Code', icon: <Code size={12} />, start: '`', end: '`', color: '#8e8e93' },
        { label: 'Cloze', icon: <Brackets size={12} />, start: '{{c1::', end: '}}', color: '#0a84ff' },
      ] as const).map((btn) => (
        <button
          key={btn.label}
          type="button"
          onClick={() => insertFormatting(field, btn.start, btn.end, isEdit)}
          style={{ ...toolbarBtnStyle, color: btn.color }}
          title={btn.label}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = btn.color;
          }}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '760px',
        width: '100%',
        maxHeight: '90vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        background: 'rgba(28, 28, 30, 0.92)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        padding: '24px',
        overflow: 'hidden',
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px', right: '20px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a2a2a7',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
        >
          <X size={15} />
        </button>

        {/* Modal Header */}
        <div>
          <h3 style={{ fontSize: '19px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.4px' }}>
            Manage Cards: {deck?.name}
          </h3>
          <p style={{ fontSize: '13px', color: '#8e8e93', marginTop: '4px' }}>
            Create new flashcards or review and edit existing cards in this deck.
          </p>
        </div>

        {/* Split-Face Flashcard Creator Form */}
        <form onSubmit={handleCreateCardSubmit} style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '14px', 
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          padding: '16px',
          borderRadius: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#0a84ff' }}>Quick Card Creator</span>
            <select
              value={newCardType}
              onChange={e => setNewCardType(e.target.value as CardType)}
              style={{ 
                background: '#1c1c1e', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '6px', 
                padding: '4px 8px', 
                color: '#ffffff', 
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="standard">Standard</option>
              <option value="cloze">Cloze Deletion</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Question Face (Front)</label>
                <FormatToolbar field="front" />
              </div>
              <textarea
                id="new-front"
                rows={2}
                placeholder="Enter card question or cloze statement..."
                value={newCardFront}
                onChange={e => setNewCardFront(e.target.value)}
                className="textarea-premium"
                style={{ resize: 'none' }}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Answer Face (Back)</label>
                <FormatToolbar field="back" />
              </div>
              <textarea
                id="new-back"
                rows={2}
                placeholder="Enter card answer details or markdown..."
                value={newCardBack}
                onChange={e => setNewCardBack(e.target.value)}
                className="textarea-premium"
                style={{ resize: 'none' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-premium-primary"
            style={{ alignSelf: 'flex-start', height: '32px', padding: '0 16px', fontSize: '12px' }}
          >
            Add Card
          </button>
        </form>

        {/* List of cards in the deck */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
              Cards in Deck ({store.cards.length})
            </span>
            <div style={{ position: 'relative', width: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8e8e93' }} />
              <input 
                type="text" 
                placeholder="Search cards..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-premium"
                style={{ paddingLeft: '30px', height: '32px', fontSize: '12px' }}
              />
            </div>
          </div>
          
          {store.cards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8e8e93', fontSize: '13px' }}>
              This deck has no cards yet. Add a card above to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {store.cards.filter(c => c.front.toLowerCase().includes(searchQuery.toLowerCase()) || c.back.toLowerCase().includes(searchQuery.toLowerCase())).map((card, idx) => {
                const isExpanded = expandedCardId === card.id;
                const isEditing = editingCardId === card.id;
                
                return (
                  <div 
                    key={card.id} 
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      background: isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      border: isExpanded ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      transition: 'all 0.2s ease',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Collapsed Header Row */}
                    <div 
                      onClick={() => {
                        if (card.id) {
                          setExpandedCardId(isExpanded ? null : card.id);
                          if (isExpanded) setEditingCardId(null);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        justifyContent: 'space-between',
                        userSelect: 'none',
                      }}
                      onMouseEnter={e => {
                        if (!isExpanded) e.currentTarget.parentElement!.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      }}
                      onMouseLeave={e => {
                        if (!isExpanded) e.currentTarget.parentElement!.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                      }}
                    >
                      {/* Left Block: Index & Chevron & Front text summary */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                        <div style={{ color: isExpanded ? '#0a84ff' : '#8e8e93', display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <span style={{ fontSize: '11px', color: '#636366', fontWeight: 600, width: '16px' }}>
                          {idx + 1}
                        </span>
                        
                        {!isExpanded && (
                          <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden', marginRight: '16px' }}>
                            <p style={{ 
                              fontSize: '13px', 
                              fontWeight: 500, 
                              color: '#ffffff', 
                              whiteSpace: 'nowrap', 
                              textOverflow: 'ellipsis', 
                              overflow: 'hidden',
                              flex: 1
                            }}>
                              {card.front}
                            </p>
                            <p style={{ 
                              fontSize: '13px', 
                              color: '#8e8e93', 
                              whiteSpace: 'nowrap', 
                              textOverflow: 'ellipsis', 
                              overflow: 'hidden',
                              flex: 1
                            }}>
                              {card.back}
                            </p>
                          </div>
                        )}
                        {isExpanded && (
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                            Card Details
                          </span>
                        )}
                      </div>

                      {/* Right Block: Badge and Quick Delete */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <span style={{ 
                          fontSize: '10px', 
                          background: card.cardType === 'cloze' ? 'rgba(10, 132, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)', 
                          color: card.cardType === 'cloze' ? '#0a84ff' : '#8e8e93',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}>
                          {card.cardType}
                        </span>

                        <span style={{ 
                          fontSize: '10px', 
                          background: 'rgba(255, 255, 255, 0.05)', 
                          color: '#8e8e93',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 500
                        }}>
                          {getCardStateLabel(card.state)}
                        </span>

                        <button
                          onClick={() => {
                            if (card.id && window.confirm('Delete this card? This action cannot be undone.')) {
                              store.deleteCard(card.id);
                            }
                          }}
                          style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: '#ff453a', 
                            cursor: 'pointer', 
                            opacity: 0.6, 
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          title="Delete Card"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Content Area / Editing Form */}
                    {isExpanded && (
                      <div style={{
                        padding: '0 16px 16px 16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        background: 'rgba(0, 0, 0, 0.12)',
                      }}>
                        {isEditing ? (
                          /* Editing View */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#0a84ff' }}>Editing Card #{idx + 1}</span>
                              <select
                                value={editCardType}
                                onChange={e => setEditCardType(e.target.value as CardType)}
                                style={{ 
                                  background: '#1c1c1e', 
                                  border: '1px solid rgba(255,255,255,0.1)', 
                                  borderRadius: '4px', 
                                  padding: '2px 6px', 
                                  color: '#ffffff', 
                                  fontSize: '11px',
                                  outline: 'none'
                                }}
                              >
                                <option value="standard">Standard</option>
                                <option value="cloze">Cloze Deletion</option>
                              </select>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Question Face (Front)</label>
                                <FormatToolbar field="front" isEdit={true} />
                              </div>
                              <textarea
                                id="edit-front"
                                rows={3}
                                value={editFront}
                                onChange={e => setEditFront(e.target.value)}
                                className="textarea-premium"
                              />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Answer Face (Back)</label>
                                <FormatToolbar field="back" isEdit={true} />
                              </div>
                              <textarea
                                id="edit-back"
                                rows={3}
                                value={editBack}
                                onChange={e => setEditBack(e.target.value)}
                                className="textarea-premium"
                              />
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                              <button
                                onClick={() => card.id && handleSaveEdit(card.id)}
                                style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
                                className="btn-premium-success"
                              >
                                <Check size={12} /> Save Changes
                              </button>
                              <button
                                onClick={() => setEditingCardId(null)}
                                style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
                                className="btn-premium-secondary"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Detailed View */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Front (Question)</span>
                                <div style={{ 
                                  fontSize: '13px', 
                                  color: '#ffffff', 
                                  whiteSpace: 'pre-wrap', 
                                  background: 'rgba(255,255,255,0.02)', 
                                  padding: '8px 12px', 
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.04)',
                                  minHeight: '40px'
                                }}>
                                  {card.front}
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Back (Answer)</span>
                                <div style={{ 
                                  fontSize: '13px', 
                                  color: '#8e8e93', 
                                  whiteSpace: 'pre-wrap', 
                                  background: 'rgba(255,255,255,0.02)', 
                                  padding: '8px 12px', 
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.04)',
                                  minHeight: '40px'
                                }}>
                                  {card.back}
                                </div>
                              </div>
                            </div>

                            {/* Card Stats & Spaced Repetition details */}
                            <div style={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: '8px', 
                              padding: '10px', 
                              background: 'rgba(255, 255, 255, 0.02)', 
                              borderRadius: '8px',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11px',
                              color: '#8e8e93'
                            }}>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <span>Difficulty: <strong style={{ color: '#ffffff' }}>{card.difficulty.toFixed(1)}</strong></span>
                                <span>Stability: <strong style={{ color: '#ffffff' }}>{card.stability.toFixed(2)}d</strong></span>
                                <span>Scheduled Interval: <strong style={{ color: '#ffffff' }}>{card.scheduledDays.toFixed(2)}d</strong></span>
                                {card.lastReviewed && (
                                  <span>Last Reviewed: <strong style={{ color: '#ffffff' }}>{new Date(card.lastReviewed).toLocaleDateString()}</strong></span>
                                )}
                              </div>

                              {/* Manual Confidence Select in Expanded Area */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: '#0a84ff', fontWeight: 500 }}>Set Confidence:</span>
                                <select
                                  value={card.id ? (card.lastRating ?? 0) : 0}
                                  onChange={async (e) => {
                                    if (card.id) {
                                      const ratingVal = parseInt(e.target.value, 10);
                                      await store.manuallySetCardConfidence(card.id, ratingVal);
                                    }
                                  }}
                                  style={{
                                    background: '#1c1c1e',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    borderRadius: '6px',
                                    padding: '2px 6px',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    outline: 'none',
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
                            </div>

                            {/* Actions panel */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleStartEdit(card)}
                                style={{
                                  background: '#0a84ff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#0070e3'}
                                onMouseLeave={e => e.currentTarget.style.background = '#0a84ff'}
                              >
                                <Edit2 size={12} /> Edit Card
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
