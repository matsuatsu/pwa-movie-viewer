import { useEffect, type RefObject } from 'react';
import type { LineShape } from '../../types';
import type { Rect } from './useCanvasSize';
import { HANDLE_VISUAL_RADIUS } from '../constants';

export function useDrawCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  lines: LineShape[],
  draftLine: LineShape | null,
  selectedId: string | null,
  videoBounds: Rect | null
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const drawLine = (line: LineShape, color: string, thickness = 2) => {
      if (!videoBounds) return;
      const x1 = videoBounds.x + line.p1.x * videoBounds.width;
      const y1 = videoBounds.y + line.p1.y * videoBounds.height;
      const x2 = videoBounds.x + line.p2.x * videoBounds.width;
      const y2 = videoBounds.y + line.p2.y * videoBounds.height;
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const drawHandles = (line: LineShape) => {
      if (!videoBounds) return;
      const handlePositions = [line.p1, line.p2];
      ctx.fillStyle = '#0b1220';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      handlePositions.forEach((p) => {
        const cx = videoBounds.x + p.x * videoBounds.width;
        const cy = videoBounds.y + p.y * videoBounds.height;
        ctx.beginPath();
        ctx.arc(cx, cy, HANDLE_VISUAL_RADIUS + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, HANDLE_VISUAL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
        ctx.stroke();
      });
    };

    lines.forEach((line) => {
      const selected = line.id === selectedId;
      drawLine(line, selected ? '#22d3ee' : '#22c55e', selected ? 3 : 2);
      if (selected) {
        drawHandles(line);
      }
    });
    if (draftLine) {
      drawLine(draftLine, '#a855f7', 2);
    }
  }, [canvasRef, draftLine, lines, selectedId, videoBounds]);
}
