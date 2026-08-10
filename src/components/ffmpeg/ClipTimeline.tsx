import React, { useCallback, useRef, useState } from 'react'
import { clamp, formatSecondsToTime } from '../../services/ffmpeg/timeUtils'
import './ClipTimeline.scss'

export interface ClipTimelineThumbnail {
  time: number
  dataUrl: string | null
  loading?: boolean
  error?: string
}

export interface ClipTimelineMarker {
  time: number
  label?: string
  type?: 'keyframe' | 'cut'
}

export interface ClipTimelineSegment {
  id: string
  start: number
  end: number
  label?: string
}

export interface ClipTimelineProps {
  inputPath: string | null
  durationSeconds: number
  currentSeconds: number
  thumbnails: ClipTimelineThumbnail[]
  range?: { start: number; end: number }
  markers?: ClipTimelineMarker[]
  segments?: ClipTimelineSegment[]
  disabled?: boolean
  durationEstimated?: boolean
  loading?: boolean
  onSeek: (seconds: number) => void
  onRangeChange?: (range: { start: number; end: number }) => void
  onSegmentChange?: (id: string, patch: { start?: number; end?: number }) => void
}

const MIN_RANGE_SECONDS = 0.5

function pct(value: number, total: number): number {
  return (clamp(value, 0, total) / total) * 100
}

const ClipTimeline: React.FC<ClipTimelineProps> = ({
  inputPath,
  durationSeconds,
  currentSeconds,
  thumbnails,
  range,
  markers = [],
  segments = [],
  disabled = false,
  durationEstimated = false,
  loading = false,
  onSeek,
  onRangeChange,
  onSegmentChange
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragging, setDragging] = useState<
    | { type: 'playhead' }
    | { type: 'range-start' | 'range-end' }
    | { type: 'segment-start' | 'segment-end'; id: string }
    | null
  >(null)

  const total = Math.max(durationSeconds || 0, MIN_RANGE_SECONDS)
  const playheadSec = clamp(currentSeconds, 0, total)
  const safeRange = range
    ? {
      start: clamp(range.start, 0, total - MIN_RANGE_SECONDS),
      end: clamp(range.end, MIN_RANGE_SECONDS, total)
    }
    : null

  const secondsFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return ratio * total
  }, [total])

  const scheduleSeek = useCallback((seconds: number) => {
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    seekTimerRef.current = setTimeout(() => onSeek(clamp(seconds, 0, total)), 120)
  }, [onSeek, total])

  const handlePointerDown = (
    nextDragging: NonNullable<typeof dragging>
  ) => (event: React.PointerEvent) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    setDragging(nextDragging)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const updateDragging = useCallback((seconds: number) => {
    if (!dragging) return

    if (dragging.type === 'playhead') {
      scheduleSeek(seconds)
      return
    }

    if ((dragging.type === 'range-start' || dragging.type === 'range-end') && safeRange && onRangeChange) {
      if (dragging.type === 'range-start') {
        const start = clamp(seconds, 0, safeRange.end - MIN_RANGE_SECONDS)
        onRangeChange({ start, end: safeRange.end })
      } else {
        const end = clamp(seconds, safeRange.start + MIN_RANGE_SECONDS, total)
        onRangeChange({ start: safeRange.start, end })
      }
      return
    }

    if ((dragging.type === 'segment-start' || dragging.type === 'segment-end') && onSegmentChange) {
      const segment = segments.find(item => item.id === dragging.id)
      if (!segment) return
      if (dragging.type === 'segment-start') {
        onSegmentChange(dragging.id, {
          start: clamp(seconds, 0, segment.end - MIN_RANGE_SECONDS)
        })
      } else {
        onSegmentChange(dragging.id, {
          end: clamp(seconds, segment.start + MIN_RANGE_SECONDS, total)
        })
      }
    }
  }, [dragging, onRangeChange, onSegmentChange, safeRange, scheduleSeek, segments, total])

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragging || disabled) return
    updateDragging(secondsFromClientX(event.clientX))
  }

  const handlePointerUp = () => setDragging(null)

  const handleTrackClick = (event: React.MouseEvent) => {
    if (disabled || dragging) return
    scheduleSeek(secondsFromClientX(event.clientX))
  }

  return (
    <div className={`ffmpeg-clip-timeline ${disabled ? 'ffmpeg-clip-timeline--disabled' : ''} ${durationEstimated ? 'ffmpeg-clip-timeline--estimated' : ''}`}>
      <div className="ffmpeg-clip-timeline__header">
        <span>剪辑时间轴</span>
        <span className="ffmpeg-clip-timeline__status">
          {loading ? '读取预览帧中...' : `${formatSecondsToTime(playheadSec)} / ${formatSecondsToTime(total)}`}
        </span>
      </div>

      <div
        ref={trackRef}
        className="ffmpeg-clip-timeline__track"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="ffmpeg-clip-timeline__thumb-strip">
          {inputPath ? thumbnails.map((thumb, index) => (
            <div key={`${thumb.time}-${index}`} className="ffmpeg-clip-timeline__thumb">
              {thumb.dataUrl ? (
                <img src={thumb.dataUrl} alt={formatSecondsToTime(thumb.time)} draggable={false} />
              ) : (
                <span>{thumb.loading ? '...' : thumb.error ? '!' : formatSecondsToTime(thumb.time)}</span>
              )}
            </div>
          )) : (
            <div className="ffmpeg-clip-timeline__empty">请选择输入文件后生成预览缩略图</div>
          )}
        </div>

        {safeRange && (
          <div
            className="ffmpeg-clip-timeline__range"
            style={{
              left: `${pct(safeRange.start, total)}%`,
              width: `${pct(safeRange.end - safeRange.start, total)}%`
            }}
          />
        )}

        {segments.map(segment => {
          const start = clamp(segment.start, 0, total)
          const end = clamp(segment.end, start + MIN_RANGE_SECONDS, total)
          return (
            <div
              key={segment.id}
              className="ffmpeg-clip-timeline__segment"
              style={{ left: `${pct(start, total)}%`, width: `${pct(end - start, total)}%` }}
              title={segment.label}
            >
              <span>{segment.label}</span>
              {onSegmentChange && (
                <>
                  <button
                    type="button"
                    className="ffmpeg-clip-timeline__segment-handle ffmpeg-clip-timeline__segment-handle--start"
                    onPointerDown={handlePointerDown({ type: 'segment-start', id: segment.id })}
                    aria-label="调整片段开始"
                  />
                  <button
                    type="button"
                    className="ffmpeg-clip-timeline__segment-handle ffmpeg-clip-timeline__segment-handle--end"
                    onPointerDown={handlePointerDown({ type: 'segment-end', id: segment.id })}
                    aria-label="调整片段结束"
                  />
                </>
              )}
            </div>
          )
        })}

        {markers.map(marker => (
          <button
            key={`${marker.type || 'marker'}-${marker.time}`}
            type="button"
            className={`ffmpeg-clip-timeline__marker ffmpeg-clip-timeline__marker--${marker.type || 'keyframe'}`}
            style={{ left: `${pct(marker.time, total)}%` }}
            title={marker.label || formatSecondsToTime(marker.time)}
            disabled={disabled}
            onClick={event => {
              event.stopPropagation()
              onSeek(marker.time)
            }}
          />
        ))}

        {safeRange && onRangeChange && (
          <>
            <button
              type="button"
              className="ffmpeg-clip-timeline__handle ffmpeg-clip-timeline__handle--start"
              style={{ left: `${pct(safeRange.start, total)}%` }}
              onPointerDown={handlePointerDown({ type: 'range-start' })}
              aria-label="调整入点"
            />
            <button
              type="button"
              className="ffmpeg-clip-timeline__handle ffmpeg-clip-timeline__handle--end"
              style={{ left: `${pct(safeRange.end, total)}%` }}
              onPointerDown={handlePointerDown({ type: 'range-end' })}
              aria-label="调整出点"
            />
          </>
        )}

        <button
          type="button"
          className="ffmpeg-clip-timeline__playhead"
          style={{ left: `${pct(playheadSec, total)}%` }}
          onPointerDown={handlePointerDown({ type: 'playhead' })}
          aria-label="拖动预览播放头"
        />
      </div>

      {durationEstimated && (
        <p className="ffmpeg-clip-timeline__note">时长未探测，时间轴刻度为估算值</p>
      )}

      <div className="ffmpeg-clip-timeline__labels">
        <span>0s</span>
        {safeRange ? (
          <>
            <span>入 {formatSecondsToTime(safeRange.start)}</span>
            <span>出 {formatSecondsToTime(safeRange.end)}</span>
          </>
        ) : (
          <span>{formatSecondsToTime(playheadSec)}</span>
        )}
        <span>{formatSecondsToTime(total)}</span>
      </div>
    </div>
  )
}

export default ClipTimeline
