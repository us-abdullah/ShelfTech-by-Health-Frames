import { useEffect, useRef } from 'react';
import type { DetectedItem } from '../lib/detection';
import type { OverlaySnippet } from '../lib/overlayRelevance';

interface OverlayCanvasProps {
  width: number;
  height: number;
  items: DetectedItem[];
  focusedLabel: string | null;
  /** Per-label emphasis and badge/line from RAG profile */
  snippets?: Record<string, OverlaySnippet>;
}

export function OverlayCanvas({ width, height, items, focusedLabel, snippets = {} }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    for (const item of items) {
      const isFocused = item.label === focusedLabel;
      const snip = snippets[item.label];
      const emphasis = snip?.emphasis ?? 'none';
      const hasEmphasis = emphasis === 'high' || (emphasis === 'medium' || isFocused);

      const x = item.bbox.x * width;
      const y = item.bbox.y * height;
      const w = item.bbox.width * width;
      const h = item.bbox.height * height;

      const strokeColor = isFocused ? '#00ff88' : hasEmphasis ? 'rgba(0, 255, 136, 0.95)' : 'rgba(0, 255, 136, 0.6)';
      const lineWidth = isFocused ? 4 : hasEmphasis ? 3 : 2;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x, y, w, h);

      const labelText = item.label.slice(0, 20);
      const badge = snip?.badge;
      const line = snip?.line;
      ctx.font = '13px system-ui, sans-serif';

      let topOffset = 0;
      if (badge) {
        const badgeW = Math.max(ctx.measureText(badge).width + 10, 60);
        ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
        ctx.fillRect(x, y - 38, badgeW, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(badge, x + 5, y - 25);
        topOffset = 20;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      const tw = ctx.measureText(labelText).width;
      ctx.fillRect(x, y - 22 - topOffset, tw + 8, 20);
      ctx.fillStyle = '#00ff88';
      ctx.fillText(labelText, x + 4, y - 8 - topOffset);

      if (line) {
        ctx.font = '11px system-ui, sans-serif';
        const maxChars = 28;
        const displayLine = line.length > maxChars ? line.slice(0, maxChars - 1) + '…' : line;
        const lw = Math.min(ctx.measureText(displayLine).width + 10, w + 20);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x, y + h + 2, lw, 18);
        ctx.fillStyle = 'rgba(0,255,136,0.95)';
        ctx.fillText(displayLine, x + 5, y + h + 14);
      }
    }
  }, [width, height, items, focusedLabel, snippets]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
      }}
    />
  );
}
