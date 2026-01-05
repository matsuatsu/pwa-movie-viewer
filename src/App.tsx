import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import './index.css';
import { DrawingAction, LineShape, Point } from './types';
import { loadDrawing, saveDrawing } from './storage';

const STEP_EPS = 1 / 120;
const HISTORY_LIMIT = 50;

type Mode = 'draw' | 'select';

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

function useCanvasSize(container: React.RefObject<HTMLDivElement>, canvas: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    function resize() {
      const rect = container.current?.getBoundingClientRect();
      if (rect && canvas.current) {
        canvas.current.width = rect.width;
        canvas.current.height = rect.height;
      }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [container, canvas]);
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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

  useCanvasSize(containerRef, canvasRef);

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
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvasRef.current;
    ctx.clearRect(0, 0, width, height);
    const drawLine = (line: LineShape, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(line.p1.x * width, line.p1.y * height);
      ctx.lineTo(line.p2.x * width, line.p2.y * height);
      ctx.stroke();
    };
    lines.forEach((line) => {
      const color = line.id === selectedId ? '#22d3ee' : '#22c55e';
      drawLine(line, color);
    });
    if (draftLine) {
      drawLine(draftLine, '#a855f7');
    }
  }, [lines, draftLine, selectedId]);

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
    if (!rect) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const pushHistory = (action: DrawingAction) => {
    setHistory((prev) => {
      const updated = [...prev, action].slice(-HISTORY_LIMIT);
      return updated;
    });
    setRedoStack([]);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!videoUrl) return;
    const point = toNormalizedPoint(event);
    if (!point) return;
    if (mode === 'draw') {
      const newDraft: LineShape = {
        id: crypto.randomUUID(),
        type: 'line',
        p1: point,
        p2: point,
        createdAt: Date.now()
      };
      setDraftLine(newDraft);
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const hit = lines.find((line) => distanceToSegment(point, line.p1, line.p2, rect.width, rect.height) < 14);
      setSelectedId(hit ? hit.id : null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!draftLine) return;
    const point = toNormalizedPoint(event);
    if (!point) return;
    setDraftLine({ ...draftLine, p2: point });
  };

  const handlePointerUp = () => {
    if (draftLine) {
      setLines((prev) => [...prev, draftLine]);
      pushHistory({ type: 'add', line: draftLine });
      setDraftLine(null);
      setSelectedId(draftLine.id);
    }
  };

  const handleUndo = () => {
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setLines((current) => {
        if (last.type === 'add') {
          return current.filter((l) => l.id !== last.line.id);
        }
        return [...current, last.line];
      });
      setRedoStack((redo) => [...redo, last].slice(-HISTORY_LIMIT));
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setLines((current) => {
        if (last.type === 'add') {
          return [...current, last.line];
        }
        return current.filter((l) => l.id !== last.line.id);
      });
      setHistory((hist) => [...hist, last].slice(-HISTORY_LIMIT));
      return prev.slice(0, -1);
    });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const line = lines.find((l) => l.id === selectedId);
    if (!line) return;
    setLines((prev) => prev.filter((l) => l.id !== selectedId));
    pushHistory({ type: 'delete', line });
    setSelectedId(null);
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
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
  };

  const step = (direction: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
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
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setLines([]);
    setSelectedId(null);
    setHistory([]);
    setRedoStack([]);
  };

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

  return (
    <div className="app-shell">
      <div
        className="video-shell"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls={false}
            playsInline
            disablePictureInPicture
            controlsList="nodownload noremoteplayback nofullscreen"
            aria-label="Swing video"
          />
        ) : (
          <div className="empty-state">
            <p>Select a local swing video to begin.</p>
            <p className="hint">Tap the Upload button to load a file for analysis.</p>
          </div>
        )}
        <canvas className="overlay" ref={canvasRef} />

        <div className="overlay-layer overlay-top">
          <div className="glass-row">
            <div>
              <h1 className="title">Golf Swing Analyzer</h1>
              <p className="subtitle">
                Full-screen playback with frame stepping, drawing, and saved annotations.
              </p>
            </div>
            <div className="pill">
              <span className="tag">PWA</span>
              Offline-ready shell
            </div>
          </div>
          <div className="glass-row status-bar">
            <label className="file-label">
              📂 Upload video
              <input type="file" accept="video/*" onChange={onFileChange} />
            </label>
            <span className="chip">Mode: {mode === 'draw' ? 'Draw line' : 'Select/Delete'}</span>
            <span className="chip">Playback: {formattedTime(currentTime)} / {formattedTime(duration || 0)}</span>
            {videoFile && <span className="chip file-chip">{videoFile.name}</span>}
          </div>
        </div>

        <div className="overlay-layer overlay-bottom">
          <div className="glass-row toolbar">
            <button className="primary" onClick={handlePlayPause} disabled={!videoUrl}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <div className="pill speed-pill">
              <span>Speed:</span>
              {[0.25, 0.5, 1].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  disabled={!videoUrl}
                  className={playbackRate === rate ? 'active' : ''}
                >
                  {rate}x
                </button>
              ))}
            </div>
            <div className="stepper">
              <button onClick={() => step(-1)} disabled={!videoUrl}>
                ⬅︎ Prev frame
              </button>
              <button onClick={() => step(1)} disabled={!videoUrl}>
                Next frame ➡︎
              </button>
            </div>
          </div>

          <div className="glass-row seek-row">
            <input
              className="seek"
              type="range"
              min={0}
              max={duration || 0}
              step={0.001}
              value={duration ? currentTime : 0}
              onChange={(e) => handleSeek(Number(e.target.value))}
              disabled={!videoUrl}
            />
          </div>

          <div className="glass-row controls">
            <button onClick={() => setMode('draw')} disabled={!videoUrl} className={mode === 'draw' ? 'active' : ''}>
              ✏️ Draw line
            </button>
            <button onClick={() => setMode('select')} disabled={!videoUrl} className={mode === 'select' ? 'active' : ''}>
              🎯 Select/Delete
            </button>
            <button onClick={deleteSelected} disabled={!selectedId}>
              🗑️ Delete selected
            </button>
            <button onClick={handleUndo} disabled={!history.length}>
              ↩️ Undo
            </button>
            <button onClick={handleRedo} disabled={!redoStack.length}>
              ↪️ Redo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
