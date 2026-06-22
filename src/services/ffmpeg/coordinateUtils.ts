export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface SnapGuide {
  x?: number
  y?: number
  label?: string
}

export function previewToReal(
  previewX: number,
  previewY: number,
  previewW: number,
  previewH: number,
  realW: number,
  realH: number
): Point {
  if (previewW <= 0 || previewH <= 0 || realW <= 0 || realH <= 0) {
    return { x: Math.round(previewX), y: Math.round(previewY) }
  }
  return {
    x: Math.round((previewX / previewW) * realW),
    y: Math.round((previewY / previewH) * realH)
  }
}

export function realToPreview(
  x: number,
  y: number,
  previewW: number,
  previewH: number,
  realW: number,
  realH: number
): Point {
  if (previewW <= 0 || previewH <= 0 || realW <= 0 || realH <= 0) {
    return { x, y }
  }
  return {
    x: (x / realW) * previewW,
    y: (y / realH) * previewH
  }
}

export function scalePreviewSize(
  realSize: number,
  previewW: number,
  realW: number
): number {
  if (previewW <= 0 || realW <= 0) return realSize
  return (realSize / realW) * previewW
}

export function buildCanvasGuides(previewW: number, previewH: number): SnapGuide[] {
  return [
    { x: 0, label: 'left' },
    { x: previewW / 2, label: 'center-x' },
    { x: previewW, label: 'right' },
    { y: 0, label: 'top' },
    { y: previewH / 2, label: 'center-y' },
    { y: previewH, label: 'bottom' }
  ]
}

export function buildWatermarkGuides(
  rects: Rect[],
  excludeIndex: number,
  previewW: number,
  previewH: number
): SnapGuide[] {
  const guides: SnapGuide[] = buildCanvasGuides(previewW, previewH)

  rects.forEach((rect, index) => {
    if (index === excludeIndex) return
    guides.push(
      { x: rect.x, label: `wm-${index}-left` },
      { x: rect.x + rect.width / 2, label: `wm-${index}-cx` },
      { x: rect.x + rect.width, label: `wm-${index}-right` },
      { y: rect.y, label: `wm-${index}-top` },
      { y: rect.y + rect.height / 2, label: `wm-${index}-cy` },
      { y: rect.y + rect.height, label: `wm-${index}-bottom` }
    )
  })

  return guides
}

export function snapToGuides(
  x: number,
  y: number,
  guides: SnapGuide[],
  threshold = 8
): Point {
  let snappedX = x
  let snappedY = y

  for (const guide of guides) {
    if (guide.x != null && Math.abs(guide.x - x) <= threshold) {
      snappedX = guide.x
    }
    if (guide.y != null && Math.abs(guide.y - y) <= threshold) {
      snappedY = guide.y
    }
  }

  return { x: snappedX, y: snappedY }
}

export function toLocalMediaUrl(filePath: string): string {
  return `local-media://${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}
