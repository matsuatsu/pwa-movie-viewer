import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineShape } from '../types';
import { loadDrawing, saveDrawing } from '../storage';
import { ControlsSidebar, FooterControls, HeaderTime } from './ui/ControlsOverlay';
import { useCanvasSize } from './hooks/useCanvasSize';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useDrawCanvas } from './hooks/useDrawCanvas';
import { useDrawingState } from './hooks/useDrawingState';
import { useVideoPlayback } from './hooks/useVideoPlayback';
import { calculateVideoBounds, type Rect } from './utils/videoBounds';

type AppMode = 'draw' | 'playback';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const draftLineRef = useRef<LineShape | null>(null);
  const isPlayingRef = useRef(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('draw');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoBounds, setVideoBounds] = useState<Rect | null>(null);

  useViewportHeight();
  useCanvasSize(containerRef, canvasRef, videoRef, setVideoBounds);

  const showControls = useCallback((persist = false) => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    if (persist || !isPlayingRef.current || draftLineRef.current) return;
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2600);
  }, []);

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

  const videoKey = useMemo(
    () => (videoFile ? `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}` : null),
    [videoFile]
  );

  const handleVideoLoaded = useCallback(
    (video: HTMLVideoElement) => {
      setVideoBounds((prev) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || !video.videoWidth || !video.videoHeight) return prev;
        return calculateVideoBounds(rect, video.videoWidth, video.videoHeight);
      });
      if (videoKey) {
        loadDrawing(videoKey).then((saved) => {
          resetDrawing(saved ?? []);
        });
      } else {
        resetDrawing([]);
      }
    },
    [resetDrawing, videoKey]
  );

  useEffect(() => {
    if (!videoKey) return;
    saveDrawing(videoKey, lines);
  }, [lines, videoKey]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const ensurePlaybackMode = useCallback(() => {
    setAppMode((prev) => {
      if (prev === 'playback') return prev;
      clearInteraction();
      return 'playback';
    });
  }, [clearInteraction]);

  const {
    duration,
    currentTime,
    isPlaying,
    playbackRate,
    handlePlayPause,
    cycleRate,
    startStepping,
    stopStepping,
    handleSeek,
  } = useVideoPlayback({
    videoRef,
    ensurePlaybackMode,
    onShowControls: showControls,
    onLoadedMetadata: handleVideoLoaded,
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    showControls(true);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
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

  return (
    <div className="flex h-[var(--viewport-height,100dvh)] w-screen flex-col overflow-hidden bg-[#0b1220] text-slate-200">
      <header className="shrink-0 border-b border-slate-800/80 bg-slate-950/70 px-3 py-2.5 backdrop-blur">
        <HeaderTime
          controlsVisible={controlsVisible}
          hasDuration={hasDuration}
          currentTime={currentTime}
          duration={duration}
        />
      </header>

      <main
        className="relative flex-1 touch-manipulation bg-[#0b1220]"
        ref={containerRef}
        onPointerDown={handlePointerDown}
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
          onVideoSelect={() => fileInputRef.current?.click()}
          onStepBackStart={() => startStepping(-1)}
          onStepBackEnd={stopStepping}
          onCycleRate={cycleRate}
          onPlayPause={handlePlayPause}
          onStepForwardStart={() => startStepping(1)}
          onStepForwardEnd={stopStepping}
          onSeek={handleSeek}
        />
      </footer>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileChange} className="hidden" />
    </div>
  );
}
