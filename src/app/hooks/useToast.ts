import { useCallback, useEffect, useRef, useState } from 'react';

type ToastOptions = {
  durationMs?: number;
};

type ToastController = {
  message: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
};

export function useToast({ durationMs = 1000 }: ToastOptions = {}): ToastController {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setMessage(null);
  }, []);

  const showToast = useCallback(
    (nextMessage: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMessage(nextMessage);
      timerRef.current = window.setTimeout(() => {
        setMessage(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs]
  );

  useEffect(() => clearToast, [clearToast]);

  return { message, showToast, clearToast };
}
