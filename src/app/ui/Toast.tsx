import React from 'react';

type ToastProps = {
  message: string | null;
};

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-full bg-slate-950/80 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}
