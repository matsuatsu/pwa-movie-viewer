import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrawingAction, LineShape, Point } from '../types';
import { loadDrawing, saveDrawing } from '../storage';
import { ControlsOverlay } from './ui/ControlsOverlay';
import { HISTORY_LIMIT, LINE_HIT_THRESHOLD, STEP_EPS, HANDLE_HIT_RADIUS } from './constants';
import { useCanvasSize, type Rect } from './hooks/useCanvasSize';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useDrawCanvas } from './hooks/useDrawCanvas';
import { clampPoint, distanceToSegment } from './utils/geometry';
import { cx } from './utils/classnames';
import { FolderOpen } from 'lucide-react';

type Mode = 'draw' | 'select';
type DragType = 'p1' | 'p2' | 'move';

type EditSession = {
  id: string;
  before: LineShape;
  lastPointer: Point;
  type: DragType;
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const editSessionRef = useRef<EditSession | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [mode, setMode] = useState<Mode>('draw');
  const [lines, setLines] = useState<LineShape[]>([]);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<DrawingAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoBounds, setVideoBounds] = useState<Rect | null>(null);

  useViewportHeight();
  useCanvasSize(containerRef, canvasRef, videoRef, setVideoBounds);
  useDrawCanvas(canvasRef, lines, draftLine, selectedId, videoBounds);

  const videoKey = useMemo(
    () => (videoFile ? `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}` : null),
    [videoFile]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoaded = () => {
      setDuration(video.duration);
      setCurrentTime(0);
      video.playbackRate = playbackRate;
      video.pause();
      setIsPlaying(false);
      setVideoBounds((prev) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || !video.videoWidth || !video.videoHeight) return prev;
        const containerAspect = rect.width / rect.height;
        const videoAspect = video.videoWidth / video.videoHeight;
        let width = rect.width;
        let height = rect.height;
        if (containerAspect > videoAspect) {
          height = rect.height;
          width = height * videoAspect;
        } else {
          width = rect.width;
          height = width / videoAspect;
        }
        const x = (rect.width - width) / 2;
        const y = (rect.height - height) / 2;
        return { x, y, width, height };
      });
      if (videoKey) {
        loadDrawing(videoKey).then((saved) => {
          setLines(saved ?? []);
          setHistory([]);
          setRedoStack([]);
          setSelectedId(null);
        });
      } else {
        setLines([]);
      }
    };
    const updateTime = () => setCurrentTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    video.addEventListener('loadedmetadata', handleLoaded);
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [playbackRate, videoKey]);

  useEffect(() => {
    if (!videoKey) return;
    saveDrawing(videoKey, lines);
  }, [lines, videoKey]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

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

  const showControls = (persist = false) => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (persist || !isPlaying || draftLine) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2600);
  };

  const findHit = (point: Point): { line: LineShape | null; target: DragType | null } => {
    if (!videoBounds) return { line: null, target: null as DragType | null };
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
    if (hitLine) return { line: hitLine, target: 'move' as DragType };
    return { line: null, target: null };
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!videoUrl || event.button === 2) return;
    const pointerTarget = event.target as HTMLElement | null;
    if (pointerTarget?.closest('button, input, select, textarea')) return;
    const point = toNormalizedPoint(event);
    showControls(true);

    if (point) {
      const { line, target } = findHit(point);
      if (line) {
        if (mode === 'draw') setMode('select');
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

    if (mode === 'draw') {
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
    showControls(true);
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
    showControls(true);
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
      return prev.slice(0, -1);
    });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    showControls(true);
    const line = lines.find((l) => l.id === selectedId);
    if (!line) return;
    setLines((prev) => prev.filter((l) => l.id !== selectedId));
    pushHistory({ type: 'delete', line });
    setSelectedId(null);
  }, [lines, selectedId]);

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

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    if (isPlaying) {
      video.pause();
    } else {
      video.playbackRate = playbackRate;
      video.play();
    }
  };

  const handleRateChange = (value: number) => {
    setPlaybackRate(value);
    if (videoRef.current) {
      videoRef.current.playbackRate = value;
    }
    showControls(true);
  };

  const cycleRate = () => {
    const options = [0.1, 0.25, 1];
    const currentIndex = options.indexOf(playbackRate);
    const next = options[(currentIndex + 1) % options.length];
    handleRateChange(next);
  };

  const step = (direction: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    showControls();
    video.pause();
    const target = Math.min(duration, Math.max(0, video.currentTime + direction * STEP_EPS));
    if ('requestVideoFrameCallback' in video) {
      (video as HTMLVideoElement & { requestVideoFrameCallback?: any }).requestVideoFrameCallback?.(() => {
        setCurrentTime(video.currentTime);
      });
    }
    video.currentTime = target;
  };

  const handleSeek = (value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    showControls(true);
    video.currentTime = value;
    setCurrentTime(value);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    showControls(true);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setLines([]);
    setSelectedId(null);
    setHistory([]);
    setRedoStack([]);
  };

  const handleModeToggle = () => {
    showControls(true);
    setMode((prev) => (prev === 'draw' ? 'select' : 'draw'));
  };

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setControlsVisible(true);
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [isPlaying, draftLine, mode, selectedId]);

  const hasDuration = Boolean(duration && !Number.isNaN(duration));
  const hasVideo = Boolean(videoUrl);

  const btnBase =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.9rem] border border-slate-700 bg-slate-800 px-3 py-2.5 font-semibold text-slate-200 ' +
    'transition-[transform,box-shadow,background,opacity] duration-150 hover:-translate-y-px hover:bg-slate-900 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] ' +
    'disabled:cursor-not-allowed disabled:opacity-45';
  const iconWithLabel = 'flex-col gap-1.5 text-center leading-tight';
  const ctaButton = cx(
    btnBase,
    iconWithLabel,
    'border-0 bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shadow-[0_18px_45px_rgba(0,0,0,0.35)] px-4 py-3 text-[1.05rem] rounded-[0.95rem]'
  );

  return (
    <div className="relative h-[var(--viewport-height,100dvh)] w-screen overflow-hidden text-slate-200">
      <div
        className="relative h-full w-full touch-manipulation bg-[#0b1220]"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute inset-0">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls={false}
              playsInline
              disablePictureInPicture
              controlsList="nodownload noremoteplayback nofullscreen"
              aria-label="Swing video"
              className="absolute inset-0 h-full w-full bg-black object-contain pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-slate-900/70 to-slate-900/50 p-4 text-center text-slate-300">
              <button className={ctaButton} onClick={() => fileInputRef.current?.click()}>
                <FolderOpen aria-hidden size={20} />
                Choose video
              </button>
            </div>
          )}
        </div>

        <canvas className="absolute inset-0 h-full w-full touch-none" ref={canvasRef} style={{ pointerEvents: videoUrl ? 'auto' : 'none' }} />

        <ControlsOverlay
          controlsVisible={controlsVisible}
          mode={mode}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          hasVideo={hasVideo}
          hasDuration={hasDuration}
          currentTime={currentTime}
          duration={duration}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          canDelete={Boolean(selectedId)}
          onModeToggle={handleModeToggle}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDelete={deleteSelected}
          onStepBack={() => step(-1)}
          onUpload={() => fileInputRef.current?.click()}
          onCycleRate={cycleRate}
          onPlayPause={handlePlayPause}
          onStepForward={() => step(1)}
          onSeek={handleSeek}
        />
      </div>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}

