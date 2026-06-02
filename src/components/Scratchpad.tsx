import React, { useRef, useState, useEffect } from 'react';
import { Edit2, Eraser, Trash2, Undo } from 'lucide-react';

interface ScratchpadProps {
  visible: boolean;
}

export const Scratchpad: React.FC<ScratchpadProps> = ({ visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#6366f1'); // Default Indigo
  const lineWidth = 4;
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  // Adjust canvas size to fit the container
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height - 60; // Leave space for control toolbar
      
      // Re-fill transparent background
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [visible]);

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      setHistory(prev => [...prev, canvas.toDataURL()]);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveToHistory();

    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    
    ctx.strokeStyle = isEraser ? '#161e31' : color; // Matches card background
    ctx.lineWidth = isEraser ? 24 : lineWidth;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveToHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const undo = () => {
    if (history.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prevImage = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));

    const img = new Image();
    img.src = prevImage;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(10, 14, 23, 0.85)',
      borderRadius: '20px',
      overflow: 'hidden',
    }}>
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          flex: 1,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      />
      
      {/* Control Bar */}
      <div style={{
        height: '50px',
        background: 'rgba(18, 24, 38, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setIsEraser(false)}
            style={{
              background: !isEraser ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: !isEraser ? '1px solid #6366f1' : '1px solid transparent',
              color: !isEraser ? '#a5b4fc' : '#9ca3af',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Edit2 size={14} /> Sketch
          </button>
          
          <button
            onClick={() => setIsEraser(true)}
            style={{
              background: isEraser ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              border: isEraser ? '1px solid #ef4444' : '1px solid transparent',
              color: isEraser ? '#fca5a5' : '#9ca3af',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Eraser size={14} /> Eraser
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Preset Brush Colors */}
          {!isEraser && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '12px' }}>
              {['#6366f1', '#10b981', '#f59e0b', '#ec4899'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: color === c ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    transform: color === c ? 'scale(1.2)' : 'none',
                    transition: 'transform 0.1s ease',
                  }}
                />
              ))}
            </div>
          )}

          <button
            onClick={undo}
            disabled={history.length === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: history.length > 0 ? '#f3f4f6' : '#6b7280',
              cursor: history.length > 0 ? 'pointer' : 'default',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Undo"
          >
            <Undo size={16} />
          </button>
          
          <button
            onClick={clearCanvas}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Clear Scratchpad"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
