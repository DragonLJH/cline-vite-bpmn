import React, { useCallback, useRef, useState } from 'react'
import { clamp, formatSecondsToTime, parseTimeToSeconds } from '../../services/ffmpeg/timeUtils'
import './TrimTimeline.scss'

export interface TrimTimelineProps {
  durationSeconds: number
  start: string
  duration: string
  onChange: (patch: { start: string; duration: string }) => void
  onSeekPreview?: (seconds: number) => void
  disabled?: boolean
  durationEstimated?: boolean
}

const MIN_SEGMENT = 0.5

const TrimTimeline: React.FC<TrimTimelineProps> = ({
  durationSeconds,
  start,
  duration,
  onChange,
  onSeekPreview,
  disabled = false,
  durationEstimated = false
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'in' | 'out' | 'playhead' | null>(null)
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = Math.max(durationSeconds, MIN_SEGMENT)
  const inSec = clamp(parseTimeToSeconds(start), 0, total - MIN_SEGMENT)
  const durSec = clamp(parseTimeToSeconds(duration), MIN_SEGMENT, total - inSec)
  const outSec = inSec + durSec

  const emitChange = useCallback((nextIn: number, nextDur: number) => {
    onChange({
      start: formatSecondsToTime(nextIn),
      duration: formatSecondsToTime(nextDur)
    })
  }, [onChange])

  const scheduleSeek = useCallback((seconds: number) => {
    if (!onSeekPreview) return
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    seekTimerRef.current = setTimeout(() => onSeekPreview(seconds), 200)
  }, [onSeekPreview])

  const secondsFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return ratio * total
  }, [total])

  const handlePointerDown = (handle: 'in' | 'out' | 'playhead') => (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    setDragging(handle)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return
    const sec = secondsFromClientX(e.clientX)

    if (dragging === 'in') {
      const nextIn = clamp(sec, 0, outSec - MIN_SEGMENT)
      emitChange(nextIn, outSec - nextIn)
      scheduleSeek(nextIn)
    } else if (dragging === 'out') {
      const nextOut = clamp(sec, inSec + MIN_SEGMENT, total)
      emitChange(inSec, nextOut - inSec)
      scheduleSeek(nextOut)
    } else if (dragging === 'playhead') {
      scheduleSeek(clamp(sec, 0, total))
    }
  }

  const handlePointerUp = () => setDragging(null)

  const handleTrackClick = (e: React.MouseEvent) => {
    if (disabled || dragging) return
    const sec = secondsFromClientX(e.clientX)
    scheduleSeek(sec)
  }

  const inPct = (inSec / total) * 100
  const widthPct = (durSec / total) * 100

  return (
    <div className={`ffmpeg-trim-timeline ${disabled ? 'ffmpeg-trim-timeline--disabled' : ''} ${durationEstimated ? 'ffmpeg-trim-timeline--estimated' : ''}`}>
      <div
        ref={trackRef}
        className="ffmpeg-trim-timeline__track"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div
          className="ffmpeg-trim-timeline__range"
          style={{ left: `${inPct}%`, width: `${widthPct}%` }}
        />
        <div
          className="ffmpeg-trim-timeline__handle ffmpeg-trim-timeline__handle--in"
          style={{ left: `${inPct}%` }}
          onPointerDown={handlePointerDown('in')}
          title="入点"
        />
        <div
          className="ffmpeg-trim-timeline__handle ffmpeg-trim-timeline__handle--out"
          style={{ left: `${inPct + widthPct}%` }}
          onPointerDown={handlePointerDown('out')}
          title="出点"
        />
        <div
          className="ffmpeg-trim-timeline__playhead"
          style={{ left: `${(inSec / total) * 100}%` }}
          onPointerDown={handlePointerDown('playhead')}
        />
      </div>

      {durationEstimated && (
        <p className="ffmpeg-trim-timeline__note">时长未探测，刻度为估算值</p>
      )}

      <div className="ffmpeg-trim-timeline__labels">
        <span>0s</span>
        <span>入 {formatSecondsToTime(inSec)}</span>
        <span>出 {formatSecondsToTime(outSec)}</span>
        <span>{formatSecondsToTime(total)}</span>
      </div>

      <div className="ffmpeg-trim-timeline__inputs">
        <label className="ffmpeg-trim-timeline__field">
          <span>开始</span>
          <input
            value={start}
            disabled={disabled}
            onChange={e => {
              const nextIn = clamp(parseTimeToSeconds(e.target.value), 0, outSec - MIN_SEGMENT)
              emitChange(nextIn, outSec - nextIn)
            }}
          />
        </label>
        <label className="ffmpeg-trim-timeline__field">
          <span>时长</span>
          <input
            value={duration}
            disabled={disabled}
            onChange={e => {
              const nextDur = clamp(parseTimeToSeconds(e.target.value), MIN_SEGMENT, total - inSec)
              emitChange(inSec, nextDur)
            }}
          />
        </label>
        <label className="ffmpeg-trim-timeline__field">
          <span>结束</span>
          <input
            value={formatSecondsToTime(outSec)}
            disabled={disabled}
            onChange={e => {
              const nextOut = clamp(parseTimeToSeconds(e.target.value), inSec + MIN_SEGMENT, total)
              emitChange(inSec, nextOut - inSec)
            }}
          />
        </label>
      </div>
    </div>
  )
}

export default TrimTimeline
