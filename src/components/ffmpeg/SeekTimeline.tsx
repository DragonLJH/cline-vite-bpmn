import React, { useCallback, useEffect, useRef, useState } from 'react'
import { clamp, formatSecondsToTime, parseTimeToSeconds } from '../../services/ffmpeg/timeUtils'
import './SeekTimeline.scss'

export interface SeekTimelineProps {
  durationSeconds: number
  currentSeconds: number
  onSeek: (seconds: number) => void
  keyframeTimes?: number[]
  onKeyframeSelect?: (seconds: number) => void
  disabled?: boolean
  durationEstimated?: boolean
  loading?: boolean
}

const SeekTimeline: React.FC<SeekTimelineProps> = ({
  durationSeconds,
  currentSeconds,
  onSeek,
  keyframeTimes = [],
  onKeyframeSelect,
  disabled = false,
  durationEstimated = false,
  loading = false
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [timeInput, setTimeInput] = useState('0')
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = Math.max(durationSeconds, 0.5)
  const maxSec = Math.max(0, Math.floor(total))
  const playheadSec = clamp(currentSeconds, 0, total)

  useEffect(() => {
    setTimeInput(String(Math.round(clamp(currentSeconds, 0, maxSec))))
  }, [currentSeconds, maxSec])

  const commitTimeInput = useCallback(() => {
    const parsed = Math.round(parseTimeToSeconds(timeInput))
    const clamped = clamp(parsed, 0, maxSec)
    onSeek(clamped)
    setTimeInput(String(clamped))
  }, [timeInput, maxSec, onSeek])

  const scheduleSeek = useCallback((seconds: number) => {
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    seekTimerRef.current = setTimeout(() => onSeek(seconds), 200)
  }, [onSeek])

  const secondsFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return ratio * total
  }, [total])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    scheduleSeek(secondsFromClientX(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return
    scheduleSeek(secondsFromClientX(e.clientX))
  }

  const handlePointerUp = () => setDragging(false)

  const handleTrackClick = (e: React.MouseEvent) => {
    if (disabled || dragging) return
    scheduleSeek(secondsFromClientX(e.clientX))
  }

  const playheadPct = (playheadSec / total) * 100

  return (
    <div className={`ffmpeg-seek-timeline ${disabled ? 'ffmpeg-seek-timeline--disabled' : ''} ${durationEstimated ? 'ffmpeg-seek-timeline--estimated' : ''}`}>
      <div className="ffmpeg-seek-timeline__header">
        <span>预览帧时间轴</span>
        {loading && <span className="ffmpeg-seek-timeline__loading">截帧中…</span>}
      </div>
      <div
        ref={trackRef}
        className="ffmpeg-seek-timeline__track"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {keyframeTimes.map(time => (
          <button
            key={time}
            type="button"
            className="ffmpeg-seek-timeline__keyframe"
            style={{ left: `${(clamp(time, 0, total) / total) * 100}%` }}
            title={`关键帧 ${formatSecondsToTime(time)}`}
            disabled={disabled}
            onClick={event => {
              event.stopPropagation()
              onKeyframeSelect?.(time)
              onSeek(time)
            }}
          />
        ))}
        <div
          className="ffmpeg-seek-timeline__playhead"
          style={{ left: `${playheadPct}%` }}
          onPointerDown={handlePointerDown}
        />
      </div>
      {durationEstimated && (
        <p className="ffmpeg-seek-timeline__note">时长未探测，刻度为估算值</p>
      )}
      <div className="ffmpeg-seek-timeline__labels">
        <span>0s</span>
        <span>{formatSecondsToTime(Math.round(playheadSec))}</span>
        <span>{formatSecondsToTime(total)}</span>
      </div>
      <div className="ffmpeg-seek-timeline__time-row">
        <label className="ffmpeg-seek-timeline__time-input">
          <span>预览时间（秒）</span>
          <input
            type="text"
            inputMode="numeric"
            value={timeInput}
            disabled={disabled}
            placeholder="如 30 或 1:30"
            onChange={e => setTimeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitTimeInput()
              }
            }}
            onBlur={commitTimeInput}
          />
        </label>
        <button
          type="button"
          className="ffmpeg-seek-timeline__seek-btn"
          disabled={disabled}
          onClick={commitTimeInput}
        >
          跳转
        </button>
      </div>
    </div>
  )
}

export default SeekTimeline
