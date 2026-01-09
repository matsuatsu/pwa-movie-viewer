export type Rect = { x: number; y: number; width: number; height: number };

export function calculateVideoBounds(containerRect: DOMRect, videoWidth: number, videoHeight: number): Rect {
  const containerAspect = containerRect.width / containerRect.height;
  const videoAspect = videoWidth / videoHeight;
  let width = containerRect.width;
  let height = containerRect.height;
  if (containerAspect > videoAspect) {
    height = containerRect.height;
    width = height * videoAspect;
  } else {
    width = containerRect.width;
    height = width / videoAspect;
  }
  const x = (containerRect.width - width) / 2;
  const y = (containerRect.height - height) / 2;
  return { x, y, width, height };
}
