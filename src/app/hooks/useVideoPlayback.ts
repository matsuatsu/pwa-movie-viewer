import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { STEP_EPS } from '../constants';

const STEP_HOLD_INTERVAL_MS = 60;

type UseVideoPlaybackOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  ensurePlaybackMode: () => void;
  onShowControls: (persist?: boolean) => void;
  onLoadedMetadata?: (video: HTMLVideoElement) => void;
};

export function useVideoPlayback({
  videoRef,
  ensurePlaybackMode,
  onShowControls,
  onLoadedMetadata,
}: UseVideoPlaybackOptions) {
  const stepIntervalRef = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const stopStepping = useCallback(() => {
    if (stepIntervalRef.current !== null) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
  }, []);

  const step = useCallback(
    (direction: number) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      ensurePlaybackMode();
      onShowControls();
      video.pause();
      const target = Math.min(duration, Math.max(0, video.currentTime + direction * STEP_EPS));
      if ('requestVideoFrameCallback' in video) {
        (video as HTMLVideoElement & { requestVideoFrameCallback?: any }).requestVideoFrameCallback?.(() => {
          setCurrentTime(video.currentTime);
        });
      }
      video.currentTime = target;
    },
    [duration, ensurePlaybackMode, onShowControls, videoRef]
  );

  const startStepping = useCallback(
    (direction: number) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      ensurePlaybackMode();
      onShowControls();
      stopStepping();
      step(direction);
      stepIntervalRef.current = window.setInterval(() => step(direction), STEP_HOLD_INTERVAL_MS);
    },
    [duration, ensurePlaybackMode, onShowControls, step, stopStepping, videoRef]
  );

  const handleSeek = useCallback(
    (value: number) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      ensurePlaybackMode();
      onShowControls(true);
      video.currentTime = value;
      setCurrentTime(value);
    },
    [duration, ensurePlaybackMode, onShowControls, videoRef]
  );

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    ensurePlaybackMode();
    onShowControls();
    if (isPlaying) {
      video.pause();
    } else {
      video.playbackRate = playbackRate;
      video.play();
    }
  }, [ensurePlaybackMode, isPlaying, onShowControls, playbackRate, videoRef]);

  const handleRateChange = useCallback(
    (value: number) => {
      ensurePlaybackMode();
      setPlaybackRate(value);
      if (videoRef.current) {
        videoRef.current.playbackRate = value;
      }
      onShowControls(true);
    },
    [ensurePlaybackMode, onShowControls, videoRef]
  );

  const cycleRate = useCallback(() => {
    const options = [0.1, 0.25, 1];
    const currentIndex = options.indexOf(playbackRate);
    const next = options[(currentIndex + 1) % options.length];
    handleRateChange(next);
  }, [handleRateChange, playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoaded = () => {
      setDuration(video.duration);
      setCurrentTime(0);
      video.playbackRate = playbackRate;
      video.pause();
      setIsPlaying(false);
      onLoadedMetadata?.(video);
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
  }, [onLoadedMetadata, playbackRate, videoRef]);

  useEffect(() => {
    return () => {
      stopStepping();
    };
  }, [stopStepping]);

  return {
    duration,
    currentTime,
    isPlaying,
    playbackRate,
    handlePlayPause,
    handleRateChange,
    cycleRate,
    startStepping,
    stopStepping,
    handleSeek,
  };
}
