import React from 'react';
import {
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Redo2,
  StepBack,
  StepForward,
  Trash2,
  Undo2,
} from 'lucide-react';
import { cx } from '../utils/classnames';
import { formatTime } from '../utils/time';

type Mode = 'draw' | 'select';

type Props = {
  controlsVisible: boolean;
  mode: Mode;
  isPlaying: boolean;
  playbackRate: number;
  hasVideo: boolean;
  hasDuration: boolean;
  currentTime: number;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  onModeToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onStepBack: () => void;
  onCycleRate: () => void;
  onPlayPause: () => void;
  onStepForward: () => void;
  onSeek: (value: number) => void;
};

export function ControlsOverlay({
  controlsVisible,
  mode,
  isPlaying,
  playbackRate,
  hasVideo,
  hasDuration,
  currentTime,
  duration,
  canUndo,
  canRedo,
  canDelete,
  onModeToggle,
  onUndo,
  onRedo,
  onDelete,
  onStepBack,
  onCycleRate,
  onPlayPause,
  onStepForward,
  onSeek,
}: Props) {
  const fadeClass = controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';

  const btnBase =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.9rem] border border-slate-700 bg-slate-800 px-3 py-2.5 font-semibold text-slate-200 ' +
    'transition-[transform,box-shadow,background,opacity] duration-150 hover:-translate-y-px hover:bg-slate-900 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] ' +
    'disabled:cursor-not-allowed disabled:opacity-45';
  const iconWithLabel = 'flex-col gap-1.5 text-center leading-tight';
  const sidebarButton = cx(
    btnBase,
    iconWithLabel,
    'h-[44px] w-[50px] min-w-[50px] px-2 py-1.5 text-[0.9rem] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
  );
  const sidebarActive = 'bg-emerald-500/20 text-emerald-100 border-emerald-300/45';
  const chipButton = cx(btnBase, 'h-[44px] min-w-[44px] px-2 py-1.5 text-[0.9rem]');

  return (
    <>
      <div
        className={cx(
          'pointer-events-none absolute left-0 right-0 bottom-[calc(100px+var(--safe-bottom))] z-[3] flex items-end justify-between px-1 transition-[opacity,transform] duration-200',
          fadeClass
        )}
      >
        <div className="pointer-events-auto flex flex-col items-start gap-2.5 self-end">
          <button
            className={cx(sidebarButton, mode === 'select' && sidebarActive)}
            onClick={onModeToggle}
            disabled={!hasVideo}
            aria-label="Toggle draw or edit"
            title="Toggle draw or edit"
          >
            {mode === 'draw' ? (
              <>
                <Pencil aria-hidden size={18} />
                Draw
              </>
            ) : (
              <>
                <MousePointer2 aria-hidden size={18} />
                Edit
              </>
            )}
          </button>
          <button className={sidebarButton} onClick={onUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 aria-hidden size={18} />
            Undo
          </button>
          <button className={sidebarButton} onClick={onRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 aria-hidden size={18} />
            Redo
          </button>
          <button className={sidebarButton} onClick={onDelete} disabled={!canDelete} aria-label="Delete selected">
            <Trash2 aria-hidden size={18} />
            Delete
          </button>
          <button className={sidebarButton} onClick={onStepBack} disabled={!hasVideo} aria-label="1フレーム戻す">
            <StepBack aria-hidden size={18} />
            -1f
          </button>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2.5 self-end">
          <button
            className={cx(
              chipButton,
              'w-[50px] min-w-[50px] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
            )}
            onClick={onCycleRate}
            disabled={!hasVideo}
            aria-label="再生速度を順送り変更"
          >
            {playbackRate}x
          </button>
          <button
            className={cx(btnBase, iconWithLabel, 'bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none')}
            onClick={onPlayPause}
            disabled={!hasVideo}
            aria-label={isPlaying ? '一時停止' : '再生'}
          >
            {isPlaying ? (
              <>
                <Pause aria-hidden size={18} />
                一時停止
              </>
            ) : (
              <>
                <Play aria-hidden size={18} />
                再生
              </>
            )}
          </button>
          <button className={sidebarButton} onClick={onStepForward} disabled={!hasVideo} aria-label="1フレーム進める">
            <StepForward aria-hidden size={18} />
            +1f
          </button>
        </div>
      </div>

      <div
        className={cx(
          'pointer-events-none absolute left-0 right-0 bottom-0 z-[3] flex flex-col gap-2.5 p-[0.85rem] pb-[calc(0.85rem+var(--safe-bottom))] transition-[opacity,transform] duration-200',
          fadeClass
        )}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(15,23,42,0.72))] px-2.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-[12px]">
          <div className="min-w-[190px]">
            <small className="tabular-nums text-slate-300">
              {formatTime(hasDuration ? currentTime : 0)} / {formatTime(hasDuration ? duration : 0)}
            </small>
          </div>
          <div className="min-w-[220px] flex-1">
            <input
              className="tw-range"
              type="range"
              min={0}
              max={hasDuration ? duration : 0}
              step={0.001}
              value={hasDuration ? currentTime : 0}
              onChange={(e) => onSeek(Number(e.target.value))}
              disabled={!hasDuration}
              aria-label="シークバー"
            />
          </div>
        </div>
      </div>
    </>
  );
}

