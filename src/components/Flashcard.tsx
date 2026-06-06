import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Edit3, RotateCw } from 'lucide-react';
import { Scratchpad } from './Scratchpad';
import type { Card } from '../db/schema';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import { renderContent } from '../services/markdown';

interface FlashcardProps {
  card: Card;
  isFlipped: boolean;
  onFlip: () => void;
  autoSpeak?: boolean;
}

export const Flashcard: React.FC<FlashcardProps> = ({ card, isFlipped, onFlip, autoSpeak = false }) => {
  const [showScratchpad, setShowScratchpad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Setup speech synthesis voices once on mount and handle cleanup
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                       voices.find(v => v.lang.startsWith('en'));
      if (engVoice) {
        setSelectedVoice(engVoice);
      }
    };

    loadVoice();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoice;
    }

    return () => {
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Reset scratchpad state during render when card changes to avoid cascading renders
  const [prevCardId, setPrevCardId] = useState(card.id);
  if (card.id !== prevCardId) {
    setPrevCardId(card.id);
    setShowScratchpad(false);
  }

  // Trigger code highlighting on flip or card change
  useEffect(() => {
    Prism.highlightAll();
  }, [card.id, isFlipped]);

  // Helper function to synthesize speech
  const speakText = (text: string) => {
    // Strip markdown formatting & cloze tags for clear speech
    const cleanText = text
      .replace(/\{\{c\d+::(.*?)\}\}/g, '$1') // Extract cloze values
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/[`*#_-]/g, ' ') // Remove special markdown chars
      .trim();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel current readouts
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else {
        const voices = window.speechSynthesis.getVoices();
        const engVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                         voices.find(v => v.lang.startsWith('en'));
        if (engVoice) utterance.voice = engVoice;
      }
      
      const savedSpeed = localStorage.getItem('denki-speech-speed') || '1.0';
      utterance.rate = parseFloat(savedSpeed);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const lastSpokenRef = useRef<{ cardId?: number; isFlipped?: boolean }>({});

  // Auto-speak effect when active, triggering on card change or flip
  useEffect(() => {
    if (!autoSpeak) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Prevent double speaking during transition to next card
    // If isFlipped changes from true to false on the same card, it means the card is resetting for transition, so do not speak the front again!
    const isResettingSameCard = 
      lastSpokenRef.current.cardId === card.id && 
      lastSpokenRef.current.isFlipped === true && 
      isFlipped === false;

    if (isResettingSameCard) {
      lastSpokenRef.current = { cardId: card.id, isFlipped };
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    lastSpokenRef.current = { cardId: card.id, isFlipped };

    const textToSpeak = isFlipped ? card.back : card.front;
    speakText(textToSpeak);
  }, [card.id, isFlipped, autoSpeak]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid flipping card on click
    const textToSpeak = isFlipped ? card.back : card.front;
    speakText(textToSpeak);
  };

  const toggleScratchpad = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowScratchpad(!showScratchpad);
  };

  const cardFrontHTML = renderContent(card.front, card.cardType === 'cloze', isFlipped);
  const cardBackHTML = renderContent(card.back, false, true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', margin: '0 auto' }}>
      
      {/* 3D Perspective Card Container */}
      <div
        ref={containerRef}
        onClick={onFlip}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFlip();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label="Flip flashcard"
        className={`perspective-container ${isFlipped ? 'flipped' : ''}`}
      >
        <div className="card-glowing-glow" />
        
        <div className="flip-card-inner">
          
          {/* FRONT OF THE CARD */}
          <div className="flip-card-front" style={{ padding: '32px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', width: '100%', zIndex: 5 }}>
              <span className="badge-premium badge-premium-blue" style={{ fontSize: '10px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '30px', fontWeight: 700 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1', marginRight: '6px', display: 'inline-block', boxShadow: '0 0 8px #6366f1' }} />
                {card.cardType === 'cloze' ? 'Cloze Deletion' : 'Front'}
              </span>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={toggleScratchpad}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    padding: 0,
                    background: showScratchpad ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                    borderColor: showScratchpad ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)',
                    color: showScratchpad ? '#a5b4fc' : '#9ca3af',
                  }}
                  className="btn-premium-secondary"
                  title="Toggle Scratchpad"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={speak}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    padding: 0,
                  }}
                  className="btn-premium-secondary"
                  title="Pronounce English Text"
                >
                  <Volume2 size={14} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflowY: 'auto', minHeight: 0, zIndex: 5 }}>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: cardFrontHTML }}
                style={{ fontSize: '1.8rem', color: '#ffffff', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.55, textAlign: 'center', maxWidth: '100%', margin: '0 auto' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', color: '#8e8e93', fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 700, marginTop: '16px', zIndex: 5, opacity: 0.8 }}>
              <RotateCw size={11} style={{ color: '#818cf8' }} /> Click card to flip
            </div>

            {/* Canvas Sketchpad Overlay */}
            <Scratchpad visible={showScratchpad} />
          </div>

          {/* BACK OF THE CARD */}
          <div className="flip-card-back" style={{ padding: '32px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', width: '100%', zIndex: 5 }}>
              <span className="badge-premium badge-premium-green" style={{ fontSize: '10px', textTransform: 'uppercase', padding: '4px 10px', borderRadius: '30px', fontWeight: 700 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', marginRight: '6px', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
                Back / Answer
              </span>
              
              <button
                onClick={speak}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  padding: 0,
                }}
                className="btn-premium-secondary"
                title="Pronounce English Text"
              >
                <Volume2 size={14} />
              </button>
            </div>

            {/* Split layout if cloze deletion, showing card front as well */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflowY: 'auto', gap: '20px', minHeight: 0, zIndex: 5 }}>
              {card.cardType === 'cloze' && (
                <div style={{ opacity: 0.45, borderBottom: '1px dashed rgba(255,255,255,0.08)', paddingBottom: '16px', width: '100%', textAlign: 'center' }}>
                  <div className="markdown-content" dangerouslySetInnerHTML={{ __html: cardFrontHTML }} style={{ fontSize: '1.3rem', fontWeight: 500 }} />
                </div>
              )}
              
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: cardBackHTML }}
                style={{ fontSize: '1.8rem', color: '#ffffff', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.55, textAlign: 'center', maxWidth: '100%', margin: '0 auto' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', color: '#8e8e93', fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 700, marginTop: '16px', zIndex: 5, opacity: 0.8 }}>
              <RotateCw size={11} style={{ color: '#34d399' }} /> Flip back to front
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
