export type Point = { x: number; y: number };

export type LineShape = {
  id: string;
  type: 'line';
  p1: Point;
  p2: Point;
  createdAt: number;
};

export type AppMode = 'draw' | 'playback';

export type DrawingAction =
  | { type: 'add'; line: LineShape }
  | { type: 'delete'; line: LineShape }
  | { type: 'update'; before: LineShape; after: LineShape };
