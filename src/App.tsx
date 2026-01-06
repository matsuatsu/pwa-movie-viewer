import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DrawingAction, LineShape, Point } from './types';
import { loadDrawing, saveDrawing } from './storage';
import {
  FolderOpen,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Redo2,
  StepBack,
  StepForward,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';

const STEP_EPS = 1 / 120;
const HISTORY_LIMIT = 50;
const HANDLE_VISUAL_RADIUS = 7;
const HANDLE_HIT_RADIUS = 32;
const LINE_HIT_THRESHOLD = 18;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function distanceToSegment(p: Point, a: Point, b: Point, width: number, height: number): number {
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

function clampPoint(p: Point): Point {
  return { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
}

type Mode = 'draw' | 'select';
type DragType = 'p1' | 'p2' | 'move';
type Rect = { x: number; y: number; width: number; height: number };

type EditSession = {
  id: string;
  before: LineShape;
  lastPointer: Point;
  type: DragType;
};

function useCanvasSize(
  container: React.RefObject<HTMLDivElement>,
  canvas: React.RefObject<HTMLCanvasElement>,
  video: React.RefObject<HTMLVideoElement>,
  onBounds: (rect: Rect | null) => void
) {
  useEffect(() => {
    const resize = () => {
      const rect = container.current?.getBoundingClientRect();
      const vid = video.current;
      if (!rect || !canvas.current) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.current.width = rect.width * dpr;
      canvas.current.height = rect.height * dpr;
      canvas.current.style.width = `${rect.width}px`;
      canvas.current.style.height = `${rect.height}px`;
      const ctx = canvas.current.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!vid || !vid.videoWidth || !vid.videoHeight) {
        onBounds(null);
        return;
      }
      const containerAspect = rect.width / rect.height;
      const videoAspect = vid.videoWidth / vid.videoHeight;
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
      onBounds({ x, y, width, height });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [canvas, container, video, onBounds]);
}

function App() {
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

  useCanvasSize(containerRef, canvasRef, videoRef, setVideoBounds);

  useEffect(() => {
    const updateViewportHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--viewport-height', `${viewportHeight}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

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
          if (saved) {
            setLines(saved);
          } else {
            setLines([]);
          }
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
  }, [lines, draftLine, selectedId, videoBounds]);

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
    setHistory((prev) => {
      const updated = [...prev, action].slice(-HISTORY_LIMIT);
      return updated;
    });
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
              type: target
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
        createdAt: Date.now()
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
        type: target
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
            p2: clampPoint({ x: line.p2.x + delta.x, y: line.p2.y + delta.y })
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
      if (updated && (updated.p1.x !== session.before.p1.x || updated.p1.y !== session.before.p1.y || updated.p2.x !== session.before.p2.x || updated.p2.y !== session.before.p2.y)) {
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
    const options = [0.25, 0.5, 1];
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

  const clearSelection = () => {
    setSelectedId(null);
    editSessionRef.current = null;
    showControls(true);
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

  const formattedTime = (time: number) => {
    const minutes = Math.floor(time / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(time % 60)
      .toString()
      .padStart(2, '0');
    const ms = Math.floor((time % 1) * 1000)
      .toString()
      .padStart(3, '0');
    return `${minutes}:${seconds}.${ms}`;
  };

  const hasDuration = Boolean(duration && !Number.isNaN(duration));
  const fadeClass = controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';

  const btnBase =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.9rem] border border-slate-700 bg-slate-800 px-3 py-2.5 font-semibold text-slate-200 ' +
    'transition-[transform,box-shadow,background,opacity] duration-150 hover:-translate-y-px hover:bg-slate-900 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] ' +
    'disabled:cursor-not-allowed disabled:opacity-45';
  const iconWithLabel = 'flex-col gap-1.5 text-center leading-tight';
  const sidebarButton = cx(
    btnBase,
    iconWithLabel,
    'h-[44px] w-[50px] min-w-[50px] px-2 py-1.5 text-[0.9rem] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
  );
  const sidebarActive = 'bg-emerald-500/20 text-emerald-100 border-emerald-300/45';
  const chipButton = cx(btnBase, 'h-[44px] min-w-[44px] px-2 py-1.5 text-[0.9rem]');
  const ghostButton = 'bg-transparent border-slate-600 hover:bg-slate-900/20';
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

        <canvas
          className="absolute inset-0 h-full w-full touch-none"
          ref={canvasRef}
          style={{ pointerEvents: videoUrl ? 'auto' : 'none' }}
        />

        <div
          className={cx(
            'pointer-events-none absolute left-0 right-0 bottom-[calc(60px+var(--safe-bottom))] z-[3] flex items-end justify-between px-1 transition-[opacity,transform] duration-200',
            fadeClass
          )}
        >
          <div className="pointer-events-auto flex flex-col items-start gap-2.5 self-end">
            <button
              className={cx(sidebarButton, mode === 'select' && sidebarActive)}
              onClick={handleModeToggle}
              disabled={!videoUrl}
              aria-label="Toggle draw or edit"
              title="Toggle draw or edit"
            >
              {mode === 'draw' ? (
                <>
                  <Pencil aria-hidden size={18} />
                  Draw
                </>
              ) : (
                <>
                  <MousePointer2 aria-hidden size={18} />
                  Edit
                </>
              )}
            </button>
            <button
              className={sidebarButton}
              onClick={handleUndo}
              disabled={!history.length}
              aria-label="Undo"
            >
              <Undo2 aria-hidden size={18} />
              Undo
            </button>
            <button
              className={sidebarButton}
              onClick={handleRedo}
              disabled={!redoStack.length}
              aria-label="Redo"
            >
              <Redo2 aria-hidden size={18} />
              Redo
            </button>
            <button
              className={sidebarButton}
              onClick={deleteSelected}
              disabled={!selectedId}
              aria-label="Delete selected"
            >
              <Trash2 aria-hidden size={18} />
              Delete
            </button>
            <button
              className={sidebarButton}
              onClick={() => step(-1)}
              disabled={!videoUrl}
              aria-label="1フレーム戻す"
            >
              <StepBack aria-hidden size={18} />
              -1f
            </button>
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-2.5 self-end">
            <button
              className={sidebarButton}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload video"
            >
              <Upload aria-hidden size={18} />
              Upload
            </button>
            <button
              className={cx(chipButton, 'w-[50px] min-w-[50px] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none')}
              onClick={cycleRate}
              disabled={!videoUrl}
              aria-label="再生速度を順送り変更"
            >
              {playbackRate}x
            </button>
            <button
              className={cx(btnBase, iconWithLabel, 'text-[0.9rem] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none')}
              onClick={handlePlayPause}
              disabled={!videoUrl}
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? (
                <>
                  <Pause aria-hidden size={20} />
                  一時停止
                </>
              ) : (
                <>
                  <Play aria-hidden size={20} />
                  再生
                </>
              )}
            </button>
            <button
              className={sidebarButton}
              onClick={() => step(1)}
              disabled={!videoUrl}
              aria-label="1フレーム進める"
            >
              <StepForward aria-hidden size={18} />
              +1f
            </button>
          </div>
        </div>

        <div
          className={cx(
            'pointer-events-none absolute left-0 right-0 bottom-0 z-[3] flex flex-col gap-2.5 p-[0.85rem] pb-[calc(0.85rem+var(--safe-bottom))] transition-[opacity,transform] duration-200',
            fadeClass
          )}
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(15,23,42,0.72))] px-2.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-[12px]">
            <div className="min-w-[190px]">
              <small className="tabular-nums text-slate-300">
                {formattedTime(hasDuration ? currentTime : 0)} / {formattedTime(hasDuration ? duration : 0)}
              </small>
            </div>
            <div className="min-w-[220px] flex-1">
              <input
                className="tw-range"
                type="range"
                min={0}
                max={hasDuration ? duration : 0}
                step={0.001}
                value={hasDuration ? currentTime : 0}
                onChange={(e) => handleSeek(Number(e.target.value))}
                disabled={!hasDuration}
                aria-label="シークバー"
              />
            </div>
          </div>
        </div>

      </div>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}

export default App;
