export function formatTime(time: number) {
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
}

