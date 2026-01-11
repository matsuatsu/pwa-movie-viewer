import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppMode, LineShape } from '../types';
import { loadDrawing, saveDrawing } from '../storage';
import { ControlsSidebar, FooterControls, TimeOverlay, VideoSelectOverlay } from './ui/ControlsOverlay';
import { Toast } from './ui/Toast';
import { STEP_EPS } from './constants';
import { useCanvasSize, type Rect } from './hooks/useCanvasSize';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useDrawCanvas } from './hooks/useDrawCanvas';
import { useDrawingState } from './hooks/useDrawingState';
import { useToast } from './hooks/useToast';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const draftLineRef = useRef<LineShape | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [appMode, setAppMode] = useState<AppMode>('playback');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoBounds, setVideoBounds] = useState<Rect | null>(null);
  const previousAppModeRef = useRef<AppMode>(appMode);

  const { message: toastMessage, showToast } = useToast({ durationMs: 1000 });

  useViewportHeight();
  useCanvasSize(containerRef, canvasRef, videoRef, setVideoBounds);

  const showControls = useCallback(
    (persist = false) => {
      setControlsVisible(true);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
      if (persist || !isPlaying || draftLineRef.current) return;
      hideTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2600);
    },
    [isPlaying]
  );

  const {
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
  } = useDrawingState({
    appMode,
    videoUrl,
    videoBounds,
    containerRef,
    onShowControls: showControls,
  });

  useEffect(() => {
    draftLineRef.current = draftLine;
  }, [draftLine]);

  useDrawCanvas(canvasRef, lines, draftLine, selectedId, videoBounds);

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
          resetDrawing(saved ?? []);
        });
      } else {
        resetDrawing([]);
      }
      showToast('視聴モード');
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
  }, [playbackRate, resetDrawing, showToast, videoKey]);

  useEffect(() => {
    if (!videoKey) return;
    saveDrawing(videoKey, lines);
  }, [lines, videoKey]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (appMode === 'draw') {
      showToast('描画モード');
    } else if (previousAppModeRef.current === 'draw') {
      showToast('視聴モード');
    }
    previousAppModeRef.current = appMode;
  }, [appMode, showToast]);

  const ensurePlaybackMode = useCallback(() => {
    setAppMode((prev) => {
      if (prev === 'playback') return prev;
      clearInteraction();
      return 'playback';
    });
  }, [clearInteraction]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    ensurePlaybackMode();
    showControls();
    if (isPlaying) {
      video.pause();
    } else {
      video.playbackRate = playbackRate;
      video.play();
    }
  };

  const handleRateChange = (value: number) => {
    ensurePlaybackMode();
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
    ensurePlaybackMode();
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
    ensurePlaybackMode();
    showControls(true);
    video.currentTime = value;
    setCurrentTime(value);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    ensurePlaybackMode();
    showControls(true);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoKey(`${file.name}:${file.size}:${file.lastModified}`);
    setVideoUrl(url);
    resetDrawing([]);
  };

  const handleAppModeToggle = () => {
    showControls(true);
    if (appMode === 'playback') {
      videoRef.current?.pause();
    } else {
      clearInteraction();
    }
    setAppMode((prev) => (prev === 'draw' ? 'playback' : 'draw'));
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
  }, [isPlaying, draftLine, selectedId]);

  const hasDuration = Boolean(duration && !Number.isNaN(duration));
  const hasVideo = Boolean(videoUrl);
  const isDrawMode = appMode === 'draw';

  const isPointerOnVideo = useCallback(
    (event: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !videoBounds) return false;
      const withinX = event.clientX - rect.left;
      const withinY = event.clientY - rect.top;
      return (
        withinX >= videoBounds.x &&
        withinX <= videoBounds.x + videoBounds.width &&
        withinY >= videoBounds.y &&
        withinY <= videoBounds.y + videoBounds.height
      );
    },
    [videoBounds]
  );

  const handleMainPointerDown = (event: React.PointerEvent) => {
    const pointerTarget = event.target as HTMLElement | null;
    if (pointerTarget?.closest('button, input, select, textarea')) return;
    if (appMode === 'playback') {
      if (!videoUrl) return;
      if (isPointerOnVideo(event)) {
        handlePlayPause();
      } else {
        showControls(true);
      }
      return;
    }
    handlePointerDown(event);
  };

  return (
    <div className="flex h-[var(--viewport-height,100dvh)] w-screen flex-col overflow-hidden bg-[#0b1220] text-slate-200">
      <main
        className="relative flex-1 touch-manipulation bg-[#0b1220]"
        ref={containerRef}
        onPointerDown={handleMainPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="absolute inset-0 flex items-start justify-center">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls={false}
              playsInline
              disablePictureInPicture
              controlsList="nodownload noremoteplayback nofullscreen"
              aria-label="Swing video"
              className="h-full w-full bg-black object-contain pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0" />
          )}
        </div>

        <canvas
          className="absolute inset-0 h-full w-full touch-none"
          ref={canvasRef}
          style={{ pointerEvents: videoUrl && isDrawMode ? 'auto' : 'none' }}
        />

        <VideoSelectOverlay
          controlsVisible={controlsVisible}
          onVideoSelect={() => fileInputRef.current?.click()}
        />

        <TimeOverlay
          controlsVisible={controlsVisible}
          hasDuration={hasDuration}
          currentTime={currentTime}
          duration={duration}
        />

        <ControlsSidebar
          controlsVisible={controlsVisible}
          appMode={appMode}
          hasVideo={hasVideo}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          canDelete={Boolean(selectedId)}
          onAppModeToggle={handleAppModeToggle}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onDelete={deleteSelected}
        />

        <Toast message={toastMessage} />
      </main>

      <footer className="shrink-0 border-t border-slate-800/80 bg-slate-950/70 px-3 py-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur">
        <FooterControls
          controlsVisible={controlsVisible}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          hasVideo={hasVideo}
          hasDuration={hasDuration}
          currentTime={currentTime}
          duration={duration}
          onStepBack={() => step(-1)}
          onCycleRate={cycleRate}
          onPlayPause={handlePlayPause}
          onStepForward={() => step(1)}
          onSeek={handleSeek}
        />
      </footer>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}
