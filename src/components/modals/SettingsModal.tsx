import React, { useState, useEffect } from 'react';
import { X, Sliders, Volume2, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [retention, setRetention] = useState(0.9);
  const [easyBonus, setEasyBonus] = useState(1.3);
  const [hardMultiplier, setHardMultiplier] = useState(1.2);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);

  useEffect(() => {
    const r = localStorage.getItem('denki-fsrs-retention');
    const eb = localStorage.getItem('denki-fsrs-easy-bonus');
    const hm = localStorage.getItem('denki-fsrs-hard-multiplier');
    const ss = localStorage.getItem('denki-speech-speed');

    if (r) setRetention(parseFloat(r));
    if (eb) setEasyBonus(parseFloat(eb));
    if (hm) setHardMultiplier(parseFloat(hm));
    if (ss) setSpeechSpeed(parseFloat(ss));

    // ESC key closes modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('denki-fsrs-retention', String(retention));
    localStorage.setItem('denki-fsrs-easy-bonus', String(easyBonus));
    localStorage.setItem('denki-fsrs-hard-multiplier', String(hardMultiplier));
    localStorage.setItem('denki-speech-speed', String(speechSpeed));

    confetti({
      particleCount: 30,
      spread: 40,
      origin: { y: 0.8 },
      colors: ['#0a84ff', '#30d158']
    });

    onClose();
  };

  const handleReset = () => {
    if (window.confirm('Reset settings to system defaults?')) {
      setRetention(0.9);
      setEasyBonus(1.3);
      setHardMultiplier(1.2);
      setSpeechSpeed(1.0);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '20px',
    }}>
      <form onSubmit={handleSave} className="glass-panel" style={{
        width: '100%',
        maxWidth: '520px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        animation: 'scaleIn 0.25s ease',
        background: 'rgba(20, 20, 25, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        textAlign: 'left',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0a84ff' }}>
            <Sliders size={18} />
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6' }}>Preferences & Algorithm</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Spaced Repetition parameters */}
        <div>
          <h4 style={{ fontSize: '12px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px', fontWeight: 700 }}>
            🧠 Spaced Repetition (FSRS 4.5)
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', color: '#d1d5db', fontWeight: 500 }}>Target Retention</label>
                <span style={{ fontSize: '12px', color: '#0a84ff', fontWeight: 600, fontFamily: 'monospace' }}>{Math.round(retention * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.70"
                max="0.95"
                step="0.01"
                value={retention}
                onChange={e => setRetention(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#0a84ff' }}
              />
              <p style={{ fontSize: '11px', color: '#636366', marginTop: '4px', lineHeight: 1.3 }}>
                Target recall rate. Higher values schedule reviews more frequently to keep retention high.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#d1d5db', marginBottom: '6px', fontWeight: 500 }}>Easy Bonus</label>
                <input
                  type="number"
                  min="1.0"
                  max="2.0"
                  step="0.1"
                  value={easyBonus}
                  onChange={e => setEasyBonus(parseFloat(e.target.value))}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '8px 10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#d1d5db', marginBottom: '6px', fontWeight: 500 }}>Hard Multiplier</label>
                <input
                  type="number"
                  min="1.0"
                  max="1.5"
                  step="0.05"
                  value={hardMultiplier}
                  onChange={e => setHardMultiplier(parseFloat(e.target.value))}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '8px 10px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Speech Speed */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          <h4 style={{ fontSize: '12px', color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px', fontWeight: 700 }}>
            🔊 Text-to-Speech (Aloud)
          </h4>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', color: '#d1d5db', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Volume2 size={14} /> Speech Speed
              </label>
              <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, fontFamily: 'monospace' }}>{speechSpeed}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speechSpeed}
              onChange={e => setSpeechSpeed(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#10b981' }}
            />
            <p style={{ fontSize: '11px', color: '#636366', marginTop: '4px', lineHeight: 1.3 }}>
              Adjust the pacing of read-aloud descriptions during study sessions.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8e8e93',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RotateCcw size={12} /> Reset to Defaults
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#d1d5db',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: '#0a84ff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apply Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
