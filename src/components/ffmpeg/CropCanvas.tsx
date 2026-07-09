import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { FfmpegJobCrop } from '../../shared/ffmpeg/jobConfig'
import {
  previewToReal,
  realRectToPreview,
  type Rect
} from '../../services/ffmpeg/coordinateUtils'
import './CropCanvas.scss'

export interface CropCanvasProps {
  videoSrc?: string | null
  previewImageUrl?: string | null
  realW: number
  realH: number
  crop: FfmpegJobCrop
  onChange: (patch: Partial<FfmpegJobCrop>) => void
  disabled?: boolean
  resolutionEstimated?: boolean
  previewLoading?: boolean
}

type DragHandle =
  | 'left' | 'right' | 'top' | 'bottom'
  | 'tl' | 'tr' | 'bl' | 'br'

const MIN_CROP = 32

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeCrop(crop: FfmpegJobCrop, realW: number, realH: number): FfmpegJobCrop {
  const x = clamp(crop.x, 0, Math.max(0, realW - MIN_CROP))
  const y = clamp(crop.y, 0, Math.max(0, realH - MIN_CROP))
  const width = clamp(crop.width, MIN_CROP, realW - x)
  const height = clamp(crop.height, MIN_CROP, realH - y)
  return { x, y, width, height }
}

const CropCanvas: React.FC<CropCanvasProps> = ({
  videoSrc,
  previewImageUrl,
  realW,
  realH,
  crop,
  onChange,
  disabled = false,
  resolutionEstimated = false,
  previewLoading = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<DragHandle | null>(null)
  const dragStartRef = useRef<FfmpegJobCrop | null>(null)

  const aspect = realW > 0 && realH > 0 ? realW / realH : 16 / 9
  const safeCrop = normalizeCrop(crop, realW, realH)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const width = el.clientWidth
      setPreviewSize({ w: width, h: width / aspect })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  const previewRect: Rect = previewSize.w > 0
    ? realRectToPreview(safeCrop, previewSize.w, previewSize.h, realW, realH)
    : { x: 0, y: 0, width: 0, height: 0 }

  const pointerToReal = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el || previewSize.w <= 0) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const previewX = clamp(clientX - rect.left, 0, previewSize.w)
    const previewY = clamp(clientY - rect.top, 0, previewSize.h)
    return previewToReal(previewX, previewY, previewSize.w, previewSize.h, realW, realH)
  }, [previewSize.h, previewSize.w, realH, realW])

  const applyDrag = useCallback((handle: DragHandle, pointer: { x: number; y: number }) => {
    const start = dragStartRef.current
    if (!start) return

    let next: FfmpegJobCrop = { ...start }

    if (handle === 'left' || handle === 'tl' || handle === 'bl') {
      const right = start.x + start.width
      const nextX = clamp(pointer.x, 0, right - MIN_CROP)
      next.x = nextX
      next.width = right - nextX
    }
    if (handle === 'right' || handle === 'tr' || handle === 'br') {
      next.width = clamp(pointer.x - start.x, MIN_CROP, realW - start.x)
    }
    if (handle === 'top' || handle === 'tl' || handle === 'tr') {
      const bottom = start.y + start.height
      const nextY = clamp(pointer.y, 0, bottom - MIN_CROP)
      next.y = nextY
      next.height = bottom - nextY
    }
    if (handle === 'bottom' || handle === 'bl' || handle === 'br') {
      next.height = clamp(pointer.y - start.y, MIN_CROP, realH - start.y)
    }

    onChange(normalizeCrop(next, realW, realH))
  }, [onChange, realH, realW])

  const handlePointerDown = (handle: DragHandle) => (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    dragStartRef.current = { ...safeCrop }
    setDragging(handle)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return
    applyDrag(dragging, pointerToReal(e.clientX, e.clientY))
  }

  const handlePointerUp = () => {
    setDragging(null)
    dragStartRef.current = null
  }

  const updateField = (patch: Partial<FfmpegJobCrop>) => {
    onChange(normalizeCrop({ ...safeCrop, ...patch }, realW, realH))
  }

  const { x, y, width, height } = previewRect

  return (
    <div className={`ffmpeg-crop-canvas ${disabled ? 'ffmpeg-crop-canvas--disabled' : ''}`}>
      <div
        ref={containerRef}
        className="ffmpeg-crop-canvas__stage"
        style={{ aspectRatio: `${realW} / ${realH}` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {previewImageUrl ? (
          <img
            className="ffmpeg-crop-canvas__image"
            src={previewImageUrl}
            alt="裁剪预览帧"
            draggable={false}
          />
        ) : videoSrc ? (
          <video
            className="ffmpeg-crop-canvas__video"
            src={videoSrc}
            muted
            playsInline
            preload="metadata"
          />
        ) : null}

        {previewLoading && (
          <div className="ffmpeg-crop-canvas__loading">正在截取预览帧…</div>
        )}

        {!disabled && previewSize.w > 0 && (
          <div className="ffmpeg-crop-canvas__overlay">
            <div className="ffmpeg-crop-canvas__mask ffmpeg-crop-canvas__mask--top" style={{ height: y }} />
            <div
              className="ffmpeg-crop-canvas__mask ffmpeg-crop-canvas__mask--bottom"
              style={{ top: y + height, height: Math.max(0, previewSize.h - y - height) }}
            />
            <div
              className="ffmpeg-crop-canvas__mask ffmpeg-crop-canvas__mask--left"
              style={{ top: y, left: 0, width: x, height }}
            />
            <div
              className="ffmpeg-crop-canvas__mask ffmpeg-crop-canvas__mask--right"
              style={{ top: y, left: x + width, width: Math.max(0, previewSize.w - x - width), height }}
            />

            <div
              className="ffmpeg-crop-canvas__frame"
              style={{ left: x, top: y, width, height }}
            >
              {(['left', 'right', 'top', 'bottom', 'tl', 'tr', 'bl', 'br'] as DragHandle[]).map(handle => (
                <div
                  key={handle}
                  className={`ffmpeg-crop-canvas__handle ffmpeg-crop-canvas__handle--${handle}`}
                  onPointerDown={handlePointerDown(handle)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {resolutionEstimated && (
        <p className="ffmpeg-crop-canvas__note">分辨率未探测，使用默认 1920×1080 刻度</p>
      )}

      <div className="ffmpeg-crop-canvas__inputs">
        <label className="ffmpeg-crop-canvas__field">
          <span>X</span>
          <input
            type="number"
            min={0}
            value={safeCrop.x}
            disabled={disabled}
            onChange={e => updateField({ x: Number(e.target.value) })}
          />
        </label>
        <label className="ffmpeg-crop-canvas__field">
          <span>Y</span>
          <input
            type="number"
            min={0}
            value={safeCrop.y}
            disabled={disabled}
            onChange={e => updateField({ y: Number(e.target.value) })}
          />
        </label>
        <label className="ffmpeg-crop-canvas__field">
          <span>宽</span>
          <input
            type="number"
            min={MIN_CROP}
            value={safeCrop.width}
            disabled={disabled}
            onChange={e => updateField({ width: Number(e.target.value) })}
          />
        </label>
        <label className="ffmpeg-crop-canvas__field">
          <span>高</span>
          <input
            type="number"
            min={MIN_CROP}
            value={safeCrop.height}
            disabled={disabled}
            onChange={e => updateField({ height: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  )
}

export default CropCanvas
