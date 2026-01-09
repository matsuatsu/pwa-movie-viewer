import { useEffect, type RefObject } from 'react';
import { calculateVideoBounds, type Rect } from '../utils/videoBounds';

export type { Rect } from '../utils/videoBounds';

export function useCanvasSize(
  container: RefObject<HTMLDivElement>,
  canvas: RefObject<HTMLCanvasElement>,
  video: RefObject<HTMLVideoElement>,
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

      onBounds(calculateVideoBounds(rect, vid.videoWidth, vid.videoHeight));
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [canvas, container, video, onBounds]);
}
