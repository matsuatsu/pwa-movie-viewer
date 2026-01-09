import React from 'react';
import {
  Brush,
  FolderOpen,
  Pause,
  Play,
  Redo2,
  StepBack,
  StepForward,
  Trash2,
  Undo2,
} from 'lucide-react';
import { cx } from '../utils/classnames';
import { formatTime } from '../utils/time';

type AppMode = 'draw' | 'playback';

type HeaderProps = {
  controlsVisible: boolean;
  hasDuration: boolean;
  currentTime: number;
  duration: number;
};

type FooterProps = {
  controlsVisible: boolean;
  isPlaying: boolean;
  playbackRate: number;
  hasVideo: boolean;
  hasDuration: boolean;
  currentTime: number;
  duration: number;
  onVideoSelect: () => void;
  onStepBackStart: () => void;
  onStepBackEnd: () => void;
  onCycleRate: () => void;
  onPlayPause: () => void;
  onStepForwardStart: () => void;
  onStepForwardEnd: () => void;
  onSeek: (value: number) => void;
};

type SidebarProps = {
  controlsVisible: boolean;
  appMode: AppMode;
  hasVideo: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  onAppModeToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
};

const btnBase =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[0.9rem] border border-slate-700 bg-slate-800 px-3 py-2.5 font-semibold text-slate-200 select-none ' +
  'transition-[transform,box-shadow,background,opacity] duration-150 hover:-translate-y-px hover:bg-slate-900 hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] ' +
  'disabled:cursor-not-allowed disabled:opacity-45';
const iconWithLabel = 'flex-col gap-1.5 text-center leading-tight';
const sidebarButton = cx(
  btnBase,
  iconWithLabel,
  'h-[44px] w-[50px] min-w-[50px] px-2 py-1.5 text-[0.9rem] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
);
const sidebarStandoutButton = cx(
  sidebarButton,
  'border-0 bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shadow-[0_14px_32px_rgba(0,0,0,0.35)] hover:from-sky-400 hover:to-emerald-400'
);
const chipButton = cx(btnBase, 'h-[44px] min-w-[44px] px-2 py-1.5 text-[0.9rem]');
const standoutChipButton = cx(
  btnBase,
  'h-[44px] min-w-[52px] px-2 py-1.5 border-0 bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 shadow-[0_14px_32px_rgba(0,0,0,0.35)] hover:from-sky-400 hover:to-emerald-400'
);
const videoSelectSoloButton = cx(standoutChipButton, 'h-[70px] w-[70px] min-w-0 rounded-full p-0');

const preventContextMenu = (event: React.MouseEvent) => event.preventDefault();

export function HeaderTime({ controlsVisible, hasDuration, currentTime, duration }: HeaderProps) {
  const fadeClass = controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1';

  return (
    <div className={cx('flex w-full items-center justify-center transition-[opacity,transform] duration-200', fadeClass)}>
      <div
        className={cx(
          btnBase,
          'justify-center bg-slate-900/35 px-3 text-sm font-semibold shadow-none hover:bg-slate-900/50 hover:shadow-none'
        )}
      >
        <small className="tabular-nums text-slate-200">
          {formatTime(hasDuration ? currentTime : 0)} / {formatTime(hasDuration ? duration : 0)}
        </small>
      </div>
    </div>
  );
}

export function FooterControls({
  controlsVisible,
  isPlaying,
  playbackRate,
  hasVideo,
  hasDuration,
  currentTime,
  duration,
  onVideoSelect,
  onStepBackStart,
  onStepBackEnd,
  onCycleRate,
  onPlayPause,
  onStepForwardStart,
  onStepForwardEnd,
  onSeek,
}: FooterProps) {
  const fadeClass = controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';

  return (
    <div
      className={cx('flex w-full flex-col items-center gap-2.5 transition-[opacity,transform] duration-200', fadeClass)}
    >
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          className={cx(standoutChipButton, hasVideo ? 'flex-row gap-2' : 'h-[70px] w-[70px] min-w-0 rounded-full')}
          onClick={onVideoSelect}
          aria-label="動画を選択"
          title="動画を選択"
        >
          <FolderOpen aria-hidden size={18} />
        </button>
        <button
          className={chipButton}
          onPointerDown={onStepBackStart}
          onPointerUp={onStepBackEnd}
          onPointerLeave={onStepBackEnd}
          onPointerCancel={onStepBackEnd}
          onContextMenu={preventContextMenu}
          disabled={!hasVideo}
          aria-label="1フレーム戻す"
        >
          <StepBack aria-hidden size={18} />
        </button>
        <button
          className={cx(
            chipButton,
            'w-[60px] min-w-[60px] bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
          )}
          onClick={onCycleRate}
          disabled={!hasVideo}
          aria-label="再生速度を順送り変更"
        >
          {playbackRate}x
        </button>
        <button
          className={cx(
            btnBase,
            'min-w-[96px] flex-row gap-2 bg-slate-900/35 border-slate-600/60 shadow-none hover:bg-slate-900/50 hover:shadow-none'
          )}
          onClick={onPlayPause}
          disabled={!hasVideo}
          aria-label={isPlaying ? '一時停止' : '再生'}
        >
          {isPlaying ? <Pause aria-hidden size={18} /> : <Play aria-hidden size={18} />}
        </button>
        <button
          className={chipButton}
          onPointerDown={onStepForwardStart}
          onPointerUp={onStepForwardEnd}
          onPointerLeave={onStepForwardEnd}
          onPointerCancel={onStepForwardEnd}
          onContextMenu={preventContextMenu}
          disabled={!hasVideo}
          aria-label="1フレーム進める"
        >
          <StepForward aria-hidden size={18} />
        </button>
      </div>

      <div
        className={cx(
          btnBase,
          'w-full justify-center bg-slate-900/35 p-1 shadow-none hover:bg-slate-900/50 hover:shadow-none'
        )}
      >
        <input
          className="tw-range w-full"
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
  );
}

export function ControlsSidebar({
  controlsVisible,
  appMode,
  hasVideo,
  canUndo,
  canRedo,
  canDelete,
  onAppModeToggle,
  onUndo,
  onRedo,
  onDelete,
}: SidebarProps) {
  const fadeClass = controlsVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2';
  const drawModeEnabled = appMode === 'draw';

  return (
    <div
      className={cx(
        'pointer-events-none absolute right-0 top-0 bottom-0 z-[3] flex items-center justify-end px-1 transition-[opacity,transform] duration-200',
        fadeClass
      )}
    >
      <div className="pointer-events-auto flex flex-col items-end gap-2.5">
        {drawModeEnabled && (
          <>
            <button className={sidebarButton} onClick={onDelete} disabled={!canDelete} aria-label="選択を削除">
              <Trash2 aria-hidden size={18} />
            </button>
            <button className={sidebarButton} onClick={onUndo} disabled={!canUndo} aria-label="元に戻す">
              <Undo2 aria-hidden size={18} />
            </button>
            <button className={sidebarButton} onClick={onRedo} disabled={!canRedo} aria-label="やり直す">
              <Redo2 aria-hidden size={18} />
            </button>
          </>
        )}
        {appMode === 'playback' && (
          <button
            className={sidebarStandoutButton}
            onClick={onAppModeToggle}
            disabled={!hasVideo}
            aria-label="視聴モードと描画モードを切り替え"
            title="視聴モードと描画モードを切り替え"
          >
            <Brush aria-hidden size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
