import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppMode, DrawingAction, LineShape, Point } from '../../types';
import { HANDLE_HIT_RADIUS, HISTORY_LIMIT, LINE_HIT_THRESHOLD } from '../constants';
import { clampPoint, distanceToSegment } from '../utils/geometry';

type DragType = 'p1' | 'p2' | 'move';

type EditSession = {
  id: string;
  before: LineShape;
  lastPointer: Point;
  type: DragType;
};

type UseDrawingStateOptions = {
  appMode: AppMode;
  videoUrl: string | null;
  videoBounds: { x: number; y: number; width: number; height: number } | null;
  containerRef: RefObject<HTMLDivElement | null>;
  onShowControls: (persist?: boolean) => void;
};

export function useDrawingState({
  appMode,
  videoUrl,
  videoBounds,
  containerRef,
  onShowControls,
}: UseDrawingStateOptions) {
  const editSessionRef = useRef<EditSession | null>(null);
  const [lines, setLines] = useState<LineShape[]>([]);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawingAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);

  const toNormalizedPoint = (event: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !videoBounds) return null;
    const withinX = event.clientX - rect.left;
    const withinY = event.clientY - rect.top;
    if (
      withinX < videoBounds.x ||
      withinX > videoBounds.x + videoBounds.width ||
      withinY < videoBounds.y ||
      withinY > videoBounds.y + videoBounds.height
    ) {
      return null;
    }
    const x = (withinX - videoBounds.x) / videoBounds.width;
    const y = (withinY - videoBounds.y) / videoBounds.height;
    return clampPoint({ x, y });
  };

  const pushHistory = (action: DrawingAction) => {
    setHistory((prev) => [...prev, action].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  };

  const findHit = (point: Point): { line: LineShape | null; target: DragType | null } => {
    if (!videoBounds) return { line: null, target: null };
    const hitHandle = lines.find((line) => {
      const dx1 =
        Math.hypot(
          point.x * videoBounds.width - line.p1.x * videoBounds.width,
          point.y * videoBounds.height - line.p1.y * videoBounds.height
        ) < HANDLE_HIT_RADIUS;
      const dx2 =
        Math.hypot(
          point.x * videoBounds.width - line.p2.x * videoBounds.width,
          point.y * videoBounds.height - line.p2.y * videoBounds.height
        ) < HANDLE_HIT_RADIUS;
      return dx1 || dx2;
    });

    if (hitHandle) {
      const handleType: DragType =
        Math.hypot(
          point.x * videoBounds.width - hitHandle.p1.x * videoBounds.width,
          point.y * videoBounds.height - hitHandle.p1.y * videoBounds.height
        ) < HANDLE_HIT_RADIUS
          ? 'p1'
          : 'p2';
      return { line: hitHandle, target: handleType };
    }

    const hitLine = lines.find(
      (line) => distanceToSegment(point, line.p1, line.p2, videoBounds.width, videoBounds.height) < LINE_HIT_THRESHOLD
    );
    if (hitLine) return { line: hitLine, target: 'move' };
    return { line: null, target: null };
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (appMode !== 'draw') {
      onShowControls(true);
      return;
    }
    if (!videoUrl || event.button === 2) return;
    const pointerTarget = event.target as HTMLElement | null;
    if (pointerTarget?.closest('button, input, select, textarea')) return;
    const point = toNormalizedPoint(event);
    onShowControls(true);

    if (point) {
      const { line, target } = findHit(point);
      if (line) {
        setSelectedId(line.id);
        editSessionRef.current = target
          ? {
              id: line.id,
              before: { ...line },
              lastPointer: point,
              type: target,
            }
          : null;
        return;
      }
    }

    const canStartDrawing = !selectedId;
    if (canStartDrawing) {
      if (!point) return;
      const newDraft: LineShape = {
        id: crypto.randomUUID(),
        type: 'line',
        p1: point,
        p2: point,
        createdAt: Date.now(),
      };
      setDraftLine(newDraft);
      return;
    }

    if (!point) {
      setSelectedId(null);
      editSessionRef.current = null;
      return;
    }

    const { line, target } = findHit(point);
    if (line && target) {
      setSelectedId(line.id);
      editSessionRef.current = {
        id: line.id,
        before: { ...line },
        lastPointer: point,
        type: target,
      };
    } else if (line) {
      setSelectedId(line.id);
    } else {
      setSelectedId(null);
      editSessionRef.current = null;
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (appMode !== 'draw') return;
    const point = toNormalizedPoint(event);
    if (draftLine) {
      if (!point) return;
      setDraftLine({ ...draftLine, p2: point });
      return;
    }

    if (!point || !editSessionRef.current) return;
    const session = editSessionRef.current;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== session.id) return line;
        if (session.type === 'move') {
          const delta = { x: point.x - session.lastPointer.x, y: point.y - session.lastPointer.y };
          session.lastPointer = point;
          return {
            ...line,
            p1: clampPoint({ x: line.p1.x + delta.x, y: line.p1.y + delta.y }),
            p2: clampPoint({ x: line.p2.x + delta.x, y: line.p2.y + delta.y }),
          };
        }
        if (session.type === 'p1') {
          session.lastPointer = point;
          return { ...line, p1: clampPoint(point) };
        }
        session.lastPointer = point;
        return { ...line, p2: clampPoint(point) };
      })
    );
  };

  const handlePointerUp = () => {
    if (appMode !== 'draw') return;
    if (draftLine) {
      setLines((prev) => [...prev, draftLine]);
      pushHistory({ type: 'add', line: draftLine });
      setDraftLine(null);
      setSelectedId(draftLine.id);
      return;
    }
    if (editSessionRef.current) {
      const session = editSessionRef.current;
      const updated = lines.find((l) => l.id === session.id);
      if (
        updated &&
        (updated.p1.x !== session.before.p1.x ||
          updated.p1.y !== session.before.p1.y ||
          updated.p2.x !== session.before.p2.x ||
          updated.p2.y !== session.before.p2.y)
      ) {
        pushHistory({ type: 'update', before: session.before, after: updated });
      }
    }
    editSessionRef.current = null;
  };

  const handleUndo = () => {
    onShowControls(true);
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setLines((current) => {
        if (last.type === 'add') {
          return current.filter((l) => l.id !== last.line.id);
        }
        if (last.type === 'delete') {
          return [...current, last.line];
        }
        return current.map((l) => (l.id === last.after.id ? last.before : l));
      });
      setRedoStack((redo) => [...redo, last].slice(-HISTORY_LIMIT));
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    onShowControls(true);
    setRedoStack((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setLines((current) => {
        if (last.type === 'add') {
          return [...current, last.line];
        }
        if (last.type === 'delete') {
          return current.filter((l) => l.id !== last.line.id);
        }
        return current.map((l) => (l.id === last.before.id ? last.after : l));
      });
      setHistory((hist) => [...hist, last].slice(-HISTORY_LIMIT));
      return prev;
    });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    onShowControls(true);
    const line = lines.find((l) => l.id === selectedId);
    if (!line) return;
    setLines((prev) => prev.filter((l) => l.id !== selectedId));
    pushHistory({ type: 'delete', line });
    setSelectedId(null);
  }, [lines, onShowControls, selectedId]);

  const resetDrawing = useCallback((nextLines: LineShape[]) => {
    setLines(nextLines);
    setDraftLine(null);
    setSelectedId(null);
    setHistory([]);
    setRedoStack([]);
    editSessionRef.current = null;
  }, []);

  const clearInteraction = useCallback(() => {
    setDraftLine(null);
    setSelectedId(null);
    editSessionRef.current = null;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !selectedId) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        return;
      }
      event.preventDefault();
      deleteSelected();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelected, selectedId]);

  return {
    lines,
    draftLine,
    selectedId,
    history,
    redoStack,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleRedo,
    deleteSelected,
    resetDrawing,
    clearInteraction,
  };
}
