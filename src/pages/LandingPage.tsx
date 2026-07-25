import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Zap, Shield, Download, Gamepad2, PenTool,
  Brain, ArrowRight, Globe, Star
} from 'lucide-react';

// Inline GitHub SVG icon (not exported by lucide-react)
const GithubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

const LandingPage: React.FC<{ hasClasses: boolean }> = ({ hasClasses }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px', margin: '16px 32px',
        borderRadius: 20, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)', position: 'sticky', top: 16, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: '1.2rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
          }}><Sparkles size={16} /></div>
          Denki
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="https://github.com/Dingding-leo/Denki" target="_blank" rel="noopener"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8e8e93', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
            <GithubIcon size={16} /> GitHub
          </a>
          {hasClasses ? (
            <Link to="/" style={{
              padding: '8px 20px', borderRadius: 100, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
              textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem'
            }}>Dashboard</Link>
          ) : (
            <button onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ padding: '8px 20px', borderRadius: 100, background: '#6366f1', color: '#fff', border: 'none',
              fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>Get Started</button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <header id="hero" style={{
        padding: '100px 32px 80px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center'
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 24,
          padding: '6px 16px', borderRadius: 100,
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
          fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 500
        }}>
          <Star size={14} /> Star us on GitHub — help us build the future of learning
        </div>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 800,
          lineHeight: 1.05, maxWidth: 800, margin: '0 0 20px',
          letterSpacing: '-0.03em'
        }}>
          Learn faster with{' '}
          <span style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundSize: '200% 200%', animation: 'gradientShift 4s ease infinite'
          }}>scientific spacing</span>
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#8e8e93', maxWidth: 560, lineHeight: 1.7, marginBottom: 40 }}>
          A focused, local-first flashcard studio powered by FSRS 4.5.
          Build reliable review habits without an account, ads, or cloud lock-in.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="https://dingding-leo.github.io/Denki/" target="_blank" rel="noopener"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 100, background: '#6366f1', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: '1rem',
              boxShadow: '0 8px 30px rgba(99,102,241,0.3)'
            }}>
            <Globe size={18} /> Try Live Demo
          </a>
          <a href="https://github.com/Dingding-leo/Denki" target="_blank" rel="noopener"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 100,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: '1rem'
            }}>
            <GithubIcon size={18} /> View Source
          </a>
        </div>
      </header>

      {/* Features Grid */}
      <section style={{ padding: '80px 32px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2.2rem', fontWeight: 700, marginBottom: 48 }}>
          Why Denki?
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24
        }}>
          {[
            { icon: <Brain size={22} />, title: 'FSRS 4.5 Engine', desc: 'State-of-the-art spaced repetition. Reviews optimized for 90% recall. Study less, remember more.' },
            { icon: <Sparkles size={22} />, title: 'AI Card Generation', desc: 'Paste your notes and let AI create flashcards instantly. Supports OpenRouter, OpenAI, and any compatible API.' },
            { icon: <Zap size={22} />, title: 'Local-First & Offline', desc: 'All data stored in your browser via IndexedDB. Works 100% offline. Your data never leaves your device.' },
            { icon: <PenTool size={22} />, title: 'Built-in Scratchpad', desc: 'Sketch diagrams, work through formulas, or annotate difficult concepts beside your flashcards. No plugins needed.' },
            { icon: <Download size={22} />, title: 'Anki Import', desc: 'One-click migration from Anki. Drag and drop your .apkg files. Also supports CSV batch import.' },
            { icon: <Gamepad2 size={22} />, title: 'Speed Match Game', desc: 'Break up study sessions with an arcade-style matching game. Gamified learning that works.' },
            { icon: <Shield size={22} />, title: 'Open Source (MIT)', desc: 'Free forever. No tracking, no ads, no premium tiers. Community-driven development.' },
            { icon: <Globe size={22} />, title: 'PWA Ready', desc: 'Install on any device. Works on desktop and mobile browsers with full offline support.' },
          ].map((f, i) => (
            <div key={i} style={{
              padding: 28, borderRadius: 20,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            }} className="feature-card-hover">
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: 20,
                background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#818cf8'
              }}>{f.icon}</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: '#8e8e93', lineHeight: 1.6, fontSize: '0.9rem' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section style={{ padding: '80px 32px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2.2rem', fontWeight: 700, marginBottom: 48 }}>
          Denki vs The Competition
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: '#8e8e93' }}>Feature</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: '#818cf8', fontWeight: 700 }}>⚡ Denki</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>Anki</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>Quizlet</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>RemNote</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['FSRS Algorithm', '✅ FSRS 4.5', '✅ SM-2/FSRS', '❌ Basic', '❌ SM-2 variant'],
                ['Open Source', '✅ MIT', '✅ AGPL', '❌ Proprietary', '❌ Proprietary'],
                ['AI Generation', '✅ Built-in', '❌ Plugin only', '✅ Limited', '✅ Limited'],
                ['Offline First', '✅ 100%', '✅ Yes', '❌ No', '⚠️ Partial'],
                ['Modern UI', '✅ Glassmorphism', '❌ 2006-era', '✅ Clean', '⚠️ Cluttered'],
                ['Scratchpad', '✅ Native', '⚠️ Plugin', '❌ No', '❌ No'],
                ['Price', '🆓 Free', '🆓 Free', '💲 $35/yr', '💲 $8/mo'],
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{row[0]}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>{row[1]}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>{row[2]}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>{row[3]}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: '#8e8e93' }}>{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '80px 32px 120px' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 16 }}>Ready to upgrade your learning?</h2>
        <p style={{ color: '#8e8e93', marginBottom: 32, fontSize: '1.1rem' }}>
          Open source. Free forever. No account required.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="https://dingding-leo.github.io/Denki/" target="_blank" rel="noopener"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 100, background: '#6366f1', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: '1rem',
            }}>
            Launch Demo <ArrowRight size={18} />
          </a>
          <a href="https://github.com/Dingding-leo/Denki" target="_blank" rel="noopener"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 100,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: '1rem',
            }}>
            <Star size={18} /> Star on GitHub
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto', padding: '40px 32px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        textAlign: 'center', color: '#6b7280', fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
          <a href="https://github.com/Dingding-leo/Denki" style={{ color: '#8e8e93', textDecoration: 'none' }}>GitHub</a>
          <a href="https://github.com/Dingding-leo/Denki/blob/main/LICENSE" style={{ color: '#8e8e93', textDecoration: 'none' }}>MIT License</a>
          <a href="https://github.com/Dingding-leo/Denki/issues" style={{ color: '#8e8e93', textDecoration: 'none' }}>Issues</a>
        </div>
        <p>Built with ⚡ by <a href="https://github.com/Dingding-leo" style={{ color: '#818cf8', textDecoration: 'none' }}>Dingding-leo</a></p>
      </footer>

      <style>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .feature-card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.2);
          border-color: rgba(99,102,241,0.2);
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
