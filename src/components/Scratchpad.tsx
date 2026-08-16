import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Eraser, Trash2, Undo } from 'lucide-react';

interface ScratchpadProps {
  visible: boolean;
}

const MAX_HISTORY = 30;
const MAX_DEVICE_PIXEL_RATIO = 2;

function currentRatio(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
}

function configureContext(
  canvas: HTMLCanvasElement,
  devicePixelRatio = currentRatio(),
): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  return context;
}

function captureCanvas(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

export const Scratchpad: React.FC<ScratchpadProps> = ({ visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resizeGenerationRef = useRef(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#9eb3a1');
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const drawSnapshot = useCallback((snapshot: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = configureContext(canvas);
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      if (canvasRef.current !== canvas) return;
      context.clearRect(0, 0, rect.width, rect.height);
      context.drawImage(
        image,
        0,
        0,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
        0,
        0,
        rect.width,
        rect.height,
      );
    };
    image.src = snapshot;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent || !visible) return;

    const previousDrawing = captureCanvas(canvas);
    const rect = parent.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height - 50));
    const ratio = currentRatio();
    const generation = ++resizeGenerationRef.current;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    configureContext(canvas, ratio);

    if (!previousDrawing) return;
    const image = new Image();
    image.onload = () => {
      if (generation !== resizeGenerationRef.current || canvasRef.current !== canvas) return;
      const context = configureContext(canvas, ratio);
      if (!context) return;
      context.drawImage(
        image,
        0,
        0,
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
        0,
        0,
        cssWidth,
        cssHeight,
      );
    };
    image.src = previousDrawing;
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const frame = window.requestAnimationFrame(resizeCanvas);
    const parent = canvasRef.current?.parentElement;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && parent) {
      observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(parent);
    }
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas, visible]);

  const saveToHistory = () => {
    const snapshot = captureCanvas(canvasRef.current);
    if (!snapshot) return;
    setHistory((current) => [...current.slice(-(MAX_HISTORY - 1)), snapshot]);
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    const context = configureContext(canvas);
    if (!context) return;

    event.preventDefault();
    event.stopPropagation();
    canvas.setPointerCapture(event.pointerId);
    saveToHistory();

    context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    context.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    context.lineWidth = isEraser ? 24 : 4;
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsDrawing(true);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    const context = configureContext(canvas);
    if (!context) return;

    event.preventDefault();
    event.stopPropagation();
    context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    context.strokeStyle = isEraser ? 'rgba(0,0,0,1)' : color;
    context.lineWidth = isEraser ? 24 : 4;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    event?.stopPropagation();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = configureContext(canvas);
    if (!context) return;

    saveToHistory();
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    drawSnapshot(previous);
  };

  const brushColors = ['#9eb3a1', '#d9caa7', '#c98f7d', '#93a9bd'];

  return (
    <div
      aria-hidden={!visible}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'rgba(12, 23, 18, 0.94)',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Scratchpad drawing area"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{ flex: 1, cursor: isEraser ? 'cell' : 'crosshair', touchAction: 'none' }}
      />

      <div style={{
        height: '50px',
        flex: '0 0 50px',
        background: 'rgba(18, 34, 27, 0.98)',
        borderTop: '1px solid rgba(211, 220, 207, 0.16)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setIsEraser(false)}
            className={isEraser ? 'btn-premium-secondary' : 'btn-premium-primary'}
            aria-pressed={!isEraser}
            style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}
          >
            <Edit2 size={13} /> Draw
          </button>
          <button
            type="button"
            onClick={() => setIsEraser(true)}
            className={isEraser ? 'btn-premium-danger' : 'btn-premium-secondary'}
            aria-pressed={isEraser}
            style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}
          >
            <Eraser size={13} /> Erase
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isEraser && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '4px' }}>
              {brushColors.map((brushColor, index) => (
                <button
                  key={brushColor}
                  type="button"
                  onClick={() => setColor(brushColor)}
                  aria-label={`Select drawing color ${index + 1}`}
                  aria-pressed={color === brushColor}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: brushColor,
                    border: color === brushColor
                      ? '2px solid var(--text-primary)'
                      : '1px solid rgba(255,255,255,0.25)',
                    cursor: 'pointer',
                    transform: color === brushColor ? 'scale(1.12)' : 'none',
                  }}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="btn-premium-secondary"
            aria-label="Undo last scratchpad change"
            title="Undo"
            style={{ width: '30px', height: '30px', padding: 0 }}
          >
            <Undo size={14} />
          </button>

          <button
            type="button"
            onClick={clearCanvas}
            className="btn-premium-danger"
            aria-label="Clear scratchpad"
            title="Clear scratchpad"
            style={{ width: '30px', height: '30px', padding: 0 }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
