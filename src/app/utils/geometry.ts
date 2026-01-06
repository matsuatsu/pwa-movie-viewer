import type { Point } from '../../types';

export function distanceToSegment(p: Point, a: Point, b: Point, width: number, height: number): number {
  const px = p.x * width;
  const py = p.y * height;
  const ax = a.x * width;
  const ay = a.y * height;
  const bx = b.x * width;
  const by = b.y * height;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const distX = px - projX;
  const distY = py - projY;
  return Math.sqrt(distX * distX + distY * distY);
}

export function clampPoint(p: Point): Point {
  return { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
}

