import React, { useCallback } from 'react'
import { clamp, formatSecondsToTime, parseTimeToSeconds } from '@/services/ffmpeg/timeUtils'

interface FilterTimeRangeProps {
  maxSeconds: number
  start?: string
  end?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onChange: (patch: { start?: string; end?: string }) => void
  onSeekPreview?: (seconds: number) => void
  disabled?: boolean
}

const FilterTimeRange: React.FC<FilterTimeRangeProps> = ({
  maxSeconds,
  start,
  end,
  enabled,
  onToggle,
  onChange,
  onSeekPreview,
  disabled = false
}) => {
  const total = Math.max(maxSeconds, 0.5)
  const startSec = enabled ? clamp(parseTimeToSeconds(start ?? '0'), 0, total) : 0
  const endSec = enabled ? clamp(parseTimeToSeconds(end ?? String(total)), startSec + 0.1, total) : total

  const emitRange = useCallback((nextStart: number, nextEnd: number) => {
    onChange({
      start: String(nextStart),
      end: String(nextEnd)
    })
  }, [onChange])

  const startPct = (startSec / total) * 100
  const widthPct = ((endSec - startSec) / total) * 100

  const handleStartDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !enabled) return
    const track = e.currentTarget.parentElement
    if (!track) return
    const onMove = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect()
      const ratio = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
      const sec = ratio * total
      const nextStart = clamp(sec, 0, endSec - 0.1)
      emitRange(nextStart, endSec)
      onSeekPreview?.(nextStart)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleEndDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !enabled) return
    const track = e.currentTarget.parentElement
    if (!track) return
    const onMove = (ev: PointerEvent) => {
      const rect = track.getBoundingClientRect()
      const ratio = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
      const sec = ratio * total
      const nextEnd = clamp(sec, startSec + 0.1, total)
      emitRange(startSec, nextEnd)
      onSeekPreview?.(nextEnd)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={`ffmpeg-props__filter-time ${disabled ? 'ffmpeg-props__filter-time--disabled' : ''}`}>
      <label className="ffmpeg-props__field ffmpeg-props__field--row">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={e => onToggle(e.target.checked)}
        />
        <span>限制显示时段</span>
      </label>

      {enabled && (
        <>
          <div className="ffmpeg-props__filter-time-track">
            <div
              className="ffmpeg-props__filter-time-range"
              style={{ left: `${startPct}%`, width: `${widthPct}%` }}
            />
            <div
              className="ffmpeg-props__filter-time-handle ffmpeg-props__filter-time-handle--start"
              style={{ left: `${startPct}%` }}
              onPointerDown={handleStartDrag}
            />
            <div
              className="ffmpeg-props__filter-time-handle ffmpeg-props__filter-time-handle--end"
              style={{ left: `${startPct + widthPct}%` }}
              onPointerDown={handleEndDrag}
            />
          </div>
          <div className="ffmpeg-props__inline-inputs">
            <label className="ffmpeg-props__field">
              <span>开始(s)</span>
              <input
                value={start ?? '0'}
                disabled={disabled}
                onChange={e => emitRange(parseTimeToSeconds(e.target.value), endSec)}
              />
            </label>
            <label className="ffmpeg-props__field">
              <span>结束(s)</span>
              <input
                value={end ?? String(total)}
                disabled={disabled}
                onChange={e => emitRange(startSec, parseTimeToSeconds(e.target.value))}
              />
            </label>
          </div>
          <p className="ffmpeg-props__hint">
            {formatSecondsToTime(startSec)} — {formatSecondsToTime(endSec)}
          </p>
        </>
      )}
    </div>
  )
}

export default FilterTimeRange
