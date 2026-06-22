import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { FfmpegJobFilter, MediaInfo } from '@/types/bpmn'
import {
  buildCanvasGuides,
  buildWatermarkGuides,
  previewToReal,
  realToPreview,
  scalePreviewSize,
  snapToGuides,
  toLocalMediaUrl,
  type Rect
} from '@/services/ffmpeg/coordinateUtils'
import { loadImageSize } from '@/services/ffmpeg/previewUtils'

interface DraggableOverlayProps {
  filter: FfmpegJobFilter
  index: number
  selected: boolean
  previewW: number
  previewH: number
  realW: number
  realH: number
  onSelect: () => void
  onMove: (x: number, y: number) => void
  onDragStateChange: (dragging: boolean) => void
  otherRects: Rect[]
}

const DraggableOverlay: React.FC<DraggableOverlayProps> = ({
  filter,
  index,
  selected,
  previewW,
  previewH,
  realW,
  realH,
  onSelect,
  onMove,
  onDragStateChange,
  otherRects
}) => {
  const [overlaySize, setOverlaySize] = useState<{ w: number; h: number } | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  const realX = filter.x ?? 10
  const realY = filter.y ?? 10
  const previewPos = realToPreview(realX, realY, previewW, previewH, realW, realH)
  const displayPos = dragPos || previewPos

  useEffect(() => {
    if (filter.type !== 'overlay') return
    loadImageSize(filter.image)
      .then(size => setOverlaySize({
        w: size.width * (filter.scale ?? 0.2),
        h: size.height * (filter.scale ?? 0.2)
      }))
      .catch(() => setOverlaySize({ w: 80, h: 40 }))
  }, [filter])

  const getRect = useCallback((): Rect => {
    if (filter.type === 'drawtext') {
      const fontSize = filter.fontSize ?? 24
      const text = filter.text || '水印'
      const pw = scalePreviewSize(fontSize * text.length * 0.6, previewW, realW)
      const ph = scalePreviewSize(fontSize * 1.2, previewW, realH)
      return { x: displayPos.x, y: displayPos.y, width: pw, height: ph }
    }
    const rw = overlaySize ? scalePreviewSize(overlaySize.w, previewW, realW) : 60
    const rh = overlaySize ? scalePreviewSize(overlaySize.h, previewH, realH) : 30
    return { x: displayPos.x, y: displayPos.y, width: rw, height: rh }
  }, [displayPos, filter, overlaySize, previewH, previewW, realH, realW])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelect()
    onDragStateChange(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const parent = (e.currentTarget as HTMLElement).offsetParent as HTMLElement
    if (!parent) return
    const parentRect = parent.getBoundingClientRect()
    let x = e.clientX - parentRect.left - dragOffset.current.x
    let y = e.clientY - parentRect.top - dragOffset.current.y
    const selfRect = getRect()
    x = Math.max(0, Math.min(x, previewW - selfRect.width))
    y = Math.max(0, Math.min(y, previewH - selfRect.height))
    const guides = buildWatermarkGuides(otherRects, index, previewW, previewH)
    const snapped = snapToGuides(x, y, guides)
    setDragPos(snapped)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    onDragStateChange(false)
    const pos = dragPos || previewPos
    const real = previewToReal(pos.x, pos.y, previewW, previewH, realW, realH)
    onMove(real.x, real.y)
    setDragPos(null)
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  }

  const rect = getRect()
  const style: React.CSSProperties = {
    left: displayPos.x,
    top: displayPos.y,
    width: rect.width,
    height: rect.height
  }

  if (filter.type === 'drawtext') {
    const fontSize = scalePreviewSize(filter.fontSize ?? 24, previewW, realW)
    return (
      <div
        className={`ffmpeg-props__watermark-layer ${selected ? 'ffmpeg-props__watermark-layer--selected' : ''}`}
        style={{ ...style, fontSize }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {filter.text}
      </div>
    )
  }

  return (
    <div
      className={`ffmpeg-props__watermark-layer ffmpeg-props__watermark-layer--image ${selected ? 'ffmpeg-props__watermark-layer--selected' : ''}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {filter.image && (
        <img src={toLocalMediaUrl(filter.image)} alt="watermark" draggable={false} />
      )}
    </div>
  )
}

export interface WatermarkCanvasProps {
  mediaInfo: MediaInfo
  previewImageUrl: string | null
  videoSrc: string | null
  filters: FfmpegJobFilter[]
  selectedIndex: number | null
  trimStartSeconds?: number
  onSelect: (index: number | null) => void
  onMove: (index: number, x: number, y: number) => void
}

const WatermarkCanvas: React.FC<WatermarkCanvasProps> = ({
  mediaInfo,
  previewImageUrl,
  videoSrc,
  filters,
  selectedIndex,
  trimStartSeconds = 0,
  onSelect,
  onMove
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)

  const realW = mediaInfo.width || 1920
  const realH = mediaInfo.height || 1080
  const aspect = realW / realH

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

  useEffect(() => {
    if (!videoRef.current || previewImageUrl) return
    videoRef.current.currentTime = trimStartSeconds
  }, [previewImageUrl, trimStartSeconds, videoSrc])

  const watermarkRects: Rect[] = filters.map((filter, index) => {
    const x = filter.x ?? 10
    const y = filter.y ?? 10
    const p = realToPreview(x, y, previewSize.w, previewSize.h, realW, realH)
    if (filter.type === 'drawtext') {
      const fs = filter.fontSize ?? 24
      return {
        x: p.x,
        y: p.y,
        width: scalePreviewSize(fs * (filter.text?.length || 2) * 0.6, previewSize.w, realW),
        height: scalePreviewSize(fs * 1.2, previewSize.h, realH)
      }
    }
    return { x: p.x, y: p.y, width: 60, height: 30 }
  })

  const canvasGuides = buildCanvasGuides(previewSize.w, previewSize.h)

  return (
    <div
      ref={containerRef}
      className="ffmpeg-props__canvas"
      style={{ aspectRatio: `${realW} / ${realH}` }}
      onClick={() => onSelect(null)}
    >
      <div
        className="ffmpeg-props__canvas-stage"
        style={{ width: previewSize.w, height: previewSize.h }}
      >
        {previewImageUrl ? (
          <img className="ffmpeg-props__canvas-bg" src={previewImageUrl} alt="preview" />
        ) : videoSrc ? (
          <video
            ref={videoRef}
            className="ffmpeg-props__canvas-bg"
            src={videoSrc}
            muted
            playsInline
          />
        ) : (
          <div className="ffmpeg-props__canvas-placeholder">无预览画面</div>
        )}

        {dragging && canvasGuides.map((guide, i) => (
          <React.Fragment key={i}>
            {guide.x != null && (
              <div
                className="ffmpeg-props__guide-line ffmpeg-props__guide-line--v"
                style={{ left: guide.x }}
              />
            )}
            {guide.y != null && (
              <div
                className="ffmpeg-props__guide-line ffmpeg-props__guide-line--h"
                style={{ top: guide.y }}
              />
            )}
          </React.Fragment>
        ))}

        {filters.map((filter, index) => (
          <DraggableOverlay
            key={index}
            filter={filter}
            index={index}
            selected={selectedIndex === index}
            previewW={previewSize.w}
            previewH={previewSize.h}
            realW={realW}
            realH={realH}
            onSelect={() => onSelect(index)}
            onMove={(x, y) => onMove(index, x, y)}
            onDragStateChange={setDragging}
            otherRects={watermarkRects}
          />
        ))}
      </div>
    </div>
  )
}

export default WatermarkCanvas
