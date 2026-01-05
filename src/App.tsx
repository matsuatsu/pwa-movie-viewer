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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
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
  const [sheetSnap, setSheetSnap] = useState<'collapsed' | 'half' | 'full'>('collapsed');
  const [controlsVisible, setControlsVisible] = useState(true);

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

  const showControls = (persist = false) => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (persist || sheetSnap !== 'collapsed' || !isPlaying || draftLine) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2600);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!videoUrl) return;
    const point = toNormalizedPoint(event);
    if (!point) return;
    showControls(true);
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
    showControls(true);
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
    showControls(true);
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
    showControls(true);
    const line = lines.find((l) => l.id === selectedId);
    if (!line) return;
    setLines((prev) => prev.filter((l) => l.id !== selectedId));
    pushHistory({ type: 'delete', line });
    setSelectedId(null);
  };

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
    if (!video) return;
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

  const toggleSheet = (nextState?: 'collapsed' | 'half' | 'full') => {
    setSheetSnap((prev) => {
      if (nextState) return nextState;
      return prev === 'collapsed' ? 'half' : 'collapsed';
    });
    showControls(true);
  };

  useEffect(() => {
    if (!isPlaying || draftLine || sheetSnap !== 'collapsed') {
      setControlsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      return;
    }
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2600);
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isPlaying, draftLine, sheetSnap]);

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

  const mapping = [
    { before: 'Upload video (status bar)', after: 'Top icon + Bottom Sheet “Video” section' },
    { before: 'Play/Pause (toolbar)', after: 'Mini bar primary control' },
    { before: 'Prev/Next frame (toolbar)', after: 'Mini bar frame-step buttons' },
    { before: 'Speed pill (toolbar)', after: 'Mini bar quick toggle + Sheet detailed speeds' },
    { before: 'Mode buttons (controls row)', after: 'Mini bar single toggle (Draw/Select)' },
    { before: 'Delete selected (controls)', after: 'Bottom Sheet Edit section' },
    { before: 'Undo/Redo (controls)', after: 'Mini bar Undo + Bottom Sheet Redo' },
    { before: 'Seek bar (seek row)', after: 'Bottom Sheet timeline' }
  ];

  return (
    <div className="app-screen">
      <div
        className="screen"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="video-layer">
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
              <button className="cta" onClick={() => fileInputRef.current?.click()}>
                📂 Choose video
              </button>
              <p className="hint">Local file stays on device for privacy.</p>
            </div>
          )}
        </div>

        <canvas className="canvas-layer" ref={canvasRef} />

        <div className={`ui-layer ui-top ${controlsVisible ? 'visible' : 'faded'}`}>
          <div className="top-bar-chip glass-row compact">
            <div className="brand">
              <span className="dot" />
              <span className="app-name">Golf Swing Analyzer</span>
            </div>
            <div className="top-actions">
              <button
                className="icon-button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload video"
                disabled={false}
              >
                📂
              </button>
              <div className="pill tight">
                <span className="tag">PWA</span>
                Offline
              </div>
            </div>
          </div>
        </div>

        <div className={`ui-layer ui-bottom ${controlsVisible ? 'visible' : 'faded'}`}>
          <div className="mini-bar glass-row compact">
            <button className="icon-button" onClick={() => step(-1)} disabled={!videoUrl} aria-label="Previous frame">
              ◀
            </button>
            <button className="primary icon-button wide" onClick={handlePlayPause} disabled={!videoUrl} aria-label="Play or pause">
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button className="icon-button" onClick={() => step(1)} disabled={!videoUrl} aria-label="Next frame">
              ▶
            </button>
            <button className="icon-button" onClick={handleUndo} disabled={!history.length} aria-label="Undo last line">
              ↩️
            </button>
            <button className="icon-button" onClick={handleModeToggle} disabled={!videoUrl} aria-label="Toggle draw or select mode">
              {mode === 'draw' ? '✏️' : '🎯'}
            </button>
            <button className="icon-button" onClick={() => toggleSheet()} aria-label="Show more controls">
              {sheetSnap === 'collapsed' ? '⌃' : '⌄'}
            </button>
          </div>
        </div>

        <div className={`bottom-sheet ${sheetSnap}`}>
          <div className={`sheet-backdrop ${sheetSnap === 'collapsed' ? 'hidden' : ''}`} onClick={() => toggleSheet('collapsed')} />
          <div className="sheet-surface" role="dialog" aria-label="Playback controls">
            <div className="sheet-handle" onClick={() => toggleSheet(sheetSnap === 'half' ? 'full' : sheetSnap === 'full' ? 'half' : 'half')}>
              <span className="grip" />
            </div>

            <div className="sheet-grid">
              <section>
                <header>
                  <h3>Video</h3>
                  <small>Local only</small>
                </header>
                <button className="wide" onClick={() => fileInputRef.current?.click()}>
                  📂 Upload / Choose
                </button>
                {videoFile && <p className="meta">{videoFile.name}</p>}
              </section>

              <section>
                <header>
                  <h3>Speed</h3>
                  <small>0.25x / 0.5x / 1.0x</small>
                </header>
                <div className="pill speed-group">
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
                  <button className="ghost" onClick={cycleRate} disabled={!videoUrl}>
                    Cycle
                  </button>
                </div>
              </section>

              <section>
                <header>
                  <h3>Timeline</h3>
                  <small>Seek without default UI</small>
                </header>
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
                <div className="meta">
                  {formattedTime(currentTime)} / {formattedTime(duration || 0)}
                </div>
              </section>

              <section>
                <header>
                  <h3>Edit</h3>
                  <small>Select / delete lines</small>
                </header>
                <div className="edit-row">
                  <button onClick={() => setMode('draw')} disabled={!videoUrl} className={mode === 'draw' ? 'active' : ''}>
                    ✏️ Draw
                  </button>
                  <button onClick={() => setMode('select')} disabled={!videoUrl} className={mode === 'select' ? 'active' : ''}>
                    🎯 Select
                  </button>
                  <button onClick={deleteSelected} disabled={!selectedId}>
                    🗑️ Delete
                  </button>
                  <button onClick={handleRedo} disabled={!redoStack.length}>
                    ↪️ Redo
                  </button>
                </div>
              </section>

              <section>
                <header>
                  <h3>Status</h3>
                  <small>Playback + mode</small>
                </header>
                <div className="status-grid">
                  <div className="chip">Mode: {mode === 'draw' ? 'Draw line' : 'Select/Delete'}</div>
                  <div className="chip">Playback: {formattedTime(currentTime)} / {formattedTime(duration || 0)}</div>
                  {videoFile && <div className="chip file-chip">File: {videoFile.name}</div>}
                  <div className="chip">Rate: {playbackRate}x</div>
                </div>
              </section>

              <section className="mapping">
                <header>
                  <h3>Before → After</h3>
                  <small>Where controls moved</small>
                </header>
                <div className="mapping-grid">
                  {mapping.map((row) => (
                    <div key={row.before} className="mapping-row">
                      <span>{row.before}</span>
                      <span>→</span>
                      <strong>{row.after}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} className="file-input" />
    </div>
  );
}

export default App;
