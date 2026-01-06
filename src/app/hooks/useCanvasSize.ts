import { useEffect, type RefObject } from 'react';

export type Rect = { x: number; y: number; width: number; height: number };

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
