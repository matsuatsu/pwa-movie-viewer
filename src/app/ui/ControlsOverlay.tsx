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
type AppMode = 'draw' | 'playback';

type Props = {
  controlsVisible: boolean;
  appMode: AppMode;
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
  onStepBackStart: () => void;
  onStepBackEnd: () => void;
  onCycleRate: () => void;
  onPlayPause: () => void;
  onStepForwardStart: () => void;
  onStepForwardEnd: () => void;
  onSeek: (value: number) => void;
};

export function ControlsOverlay({
  controlsVisible,
  appMode,
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
  onStepBackStart,
  onStepBackEnd,
  onCycleRate,
  onPlayPause,
  onStepForwardStart,
  onStepForwardEnd,
  onSeek,
}: Props) {
  const fadeClass = controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2';
  const drawModeEnabled = appMode === 'draw';

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
  const sidebarActive = 'bg-emerald-500/20 text-emerald-100 border-emerald-300/45';
  const chipButton = cx(btnBase, 'h-[44px] min-w-[44px] px-2 py-1.5 text-[0.9rem]');

  const preventContextMenu = (event: React.MouseEvent) => event.preventDefault();

  return (
    <>
      <div
        className={cx(
          'pointer-events-none absolute left-0 right-0 top-0 z-[3] flex justify-center px-2 pt-3 transition-[opacity,transform] duration-200',
          fadeClass
        )}
      >
        <div
          className={cx(
            btnBase,
            'pointer-events-auto justify-center bg-slate-900/35 px-3 text-sm font-semibold shadow-none hover:bg-slate-900/50 hover:shadow-none'
          )}
        >
          <small className="tabular-nums text-slate-200">
            {formatTime(hasDuration ? currentTime : 0)} / {formatTime(hasDuration ? duration : 0)}
          </small>
        </div>
      </div>

      <div
        className={cx(
          'pointer-events-none absolute right-0 top-0 bottom-0 z-[3] flex items-center justify-end px-1 transition-[opacity,transform] duration-200',
          fadeClass
        )}
      >
        <div className="pointer-events-auto flex flex-col items-end gap-2.5">
          <button
            className={sidebarButton}
            onClick={onDelete}
            disabled={!canDelete || !drawModeEnabled}
            aria-label="選択を削除"
          >
            <Trash2 aria-hidden size={18} />
            削除
          </button>
          <button className={sidebarButton} onClick={onUndo} disabled={!canUndo || !drawModeEnabled} aria-label="元に戻す">
            <Undo2 aria-hidden size={18} />
            元に戻す
          </button>
          <button className={sidebarButton} onClick={onRedo} disabled={!canRedo || !drawModeEnabled} aria-label="やり直す">
            <Redo2 aria-hidden size={18} />
            やり直す
          </button>
          <button
            className={cx(sidebarButton, mode === 'select' && sidebarActive)}
            onClick={onModeToggle}
            disabled={!hasVideo || !drawModeEnabled}
            aria-label="描画と編集を切り替え"
            title="描画と編集を切り替え"
          >
            {mode === 'draw' ? (
              <>
                <Pencil aria-hidden size={18} />
                描画
              </>
            ) : (
              <>
                <MousePointer2 aria-hidden size={18} />
                編集
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className={cx(
          'pointer-events-none absolute left-0 right-0 bottom-0 z-[3] flex justify-center p-[0.85rem] pb-[calc(0.85rem+var(--safe-bottom))] transition-[opacity,transform] duration-200',
          fadeClass
        )}
      >
        <div className="pointer-events-auto flex w-full max-w-[780px] flex-col items-center gap-2.5">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
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
              -1f
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
              +1f
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
      </div>
    </>
  );
}
