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
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Golf Swing Analyzer</h1>
          <p style={{ margin: '0.25rem 0', color: '#94a3b8' }}>
            PWA for Android Chrome. Local playback with frame stepping and overlay drawing.
          </p>
        </div>
        <div className="pill">
          <span className="tag">PWA</span>
          Offline-ready shell
        </div>
      </header>

      <div className="video-shell" ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} controls style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ color: '#94a3b8', display: 'grid', placeItems: 'center', height: '100%', textAlign: 'center' }}>
            <p>Select a local swing video to begin.</p>
          </div>
        )}
        <canvas className="overlay" ref={canvasRef} />
      </div>

      <div className="toolbar">
        <label className="file-label">
          📂 Choose video
          <input type="file" accept="video/*" onChange={onFileChange} />
        </label>
        <button onClick={handlePlayPause} disabled={!videoUrl}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="pill">
          Speed:
          {[0.25, 0.5, 1].map((rate) => (
            <button key={rate} onClick={() => handleRateChange(rate)} disabled={!videoUrl} style={{ background: playbackRate === rate ? '#0ea5e9' : undefined }}>
              {rate}x
            </button>
          ))}
        </div>
        <button onClick={() => step(-1)} disabled={!videoUrl}>
          ⬅︎ Prev frame
        </button>
        <button onClick={() => step(1)} disabled={!videoUrl}>
          Next frame ➡︎
        </button>
      </div>

      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="status-bar">
          <span className="chip">Mode: {mode === 'draw' ? 'Draw line' : 'Select/Delete'}</span>
          <span className="chip">Playback: {formattedTime(currentTime)} / {formattedTime(duration || 0)}</span>
          {videoFile && <span className="chip">{videoFile.name}</span>}
        </div>

        <input type="range" min={0} max={duration || 0} step={0.001} value={duration ? currentTime : 0} onChange={(e) => handleSeek(Number(e.target.value))} disabled={!videoUrl} />

        <div className="controls">
          <button onClick={() => setMode('draw')} disabled={!videoUrl} style={{ background: mode === 'draw' ? '#22c55e' : undefined }}>
            ✏️ Draw line
          </button>
          <button onClick={() => setMode('select')} disabled={!videoUrl} style={{ background: mode === 'select' ? '#22c55e' : undefined }}>
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

      <div className="panel" style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>
        <p style={{ marginTop: 0 }}>
          • Frame stepping uses the smallest supported seek window (requestVideoFrameCallback when available) to reach the next
          decoded frame.
        </p>
        <p>
          • Draw lines directly on the overlay; they scale with the video area and are stored locally per video using a
          filename/size/timestamp identifier.
        </p>
      </div>
    </div>
  );
}

export default App;
