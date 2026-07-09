import type { FfmpegJobCrop, FfmpegJobCropAdvanced, FfmpegJobCropKeyframe } from './jobConfig'

export type { FfmpegJobCropAdvanced, FfmpegJobCropKeyframe }

export function toEvenCrop(value: number): number {
  const n = Math.max(2, Math.floor(value))
  return n % 2 === 0 ? n : n - 1
}

export function sortCropKeyframes(keyframes: FfmpegJobCropKeyframe[]): FfmpegJobCropKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time)
}

export interface CropSegment {
  start: number
  end: number
  crop: FfmpegJobCrop
}

export function buildCropSegments(
  keyframes: FfmpegJobCropKeyframe[],
  durationSeconds: number,
  fallbackCrop: FfmpegJobCrop
): CropSegment[] {
  const total = Math.max(durationSeconds, 0.5)
  const sorted = sortCropKeyframes(keyframes)

  if (sorted.length === 0) {
    return [{ start: 0, end: total, crop: fallbackCrop }]
  }

  const segments: CropSegment[] = []
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]
    const next = sorted[i + 1]
    const start = Math.max(0, current.time)
    const end = next ? Math.min(total, next.time) : total
    if (end <= start) continue
    segments.push({
      start,
      end,
      crop: {
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height
      }
    })
  }

  if (segments.length === 0) {
    return [{ start: 0, end: total, crop: fallbackCrop }]
  }

  if (segments[0].start > 0) {
    segments.unshift({ start: 0, end: segments[0].start, crop: { ...sorted[0] } })
  }

  return segments
}

export function resolveCropAtTime(
  keyframes: FfmpegJobCropKeyframe[] | undefined,
  timeSeconds: number,
  fallbackCrop: FfmpegJobCrop,
  durationSeconds: number
): FfmpegJobCrop {
  if (!keyframes?.length) return fallbackCrop
  const segments = buildCropSegments(keyframes, durationSeconds, fallbackCrop)
  const t = Math.max(0, timeSeconds)
  const segment = segments.find(item => t >= item.start && t < item.end) || segments[segments.length - 1]
  return segment?.crop || fallbackCrop
}

export function findKeyframeIndexAtTime(
  keyframes: FfmpegJobCropKeyframe[],
  timeSeconds: number,
  tolerance = 0.05
): number {
  return keyframes.findIndex(item => Math.abs(item.time - timeSeconds) <= tolerance)
}

export interface KeyframeCropFilterResult {
  filterComplex: string
  mapVideo: string
  mapAudio?: string
}

export function buildKeyframeCropFilterComplex(
  segments: CropSegment[],
  options: { includeAudio?: boolean } = {}
): KeyframeCropFilterResult | null {
  if (segments.length === 0) return null

  if (segments.length === 1) {
    const only = segments[0]
    const w = toEvenCrop(only.crop.width)
    const h = toEvenCrop(only.crop.height)
    const x = toEvenCrop(only.crop.x)
    const y = toEvenCrop(only.crop.y)
    return {
      filterComplex: `[0:v]crop=${w}:${h}:${x}:${y}[outv]`,
      mapVideo: '[outv]'
    }
  }

  const includeAudio = options.includeAudio !== false
  const videoParts: string[] = []
  const audioParts: string[] = []
  const concatInputs: string[] = []

  segments.forEach((segment, index) => {
    const w = toEvenCrop(segment.crop.width)
    const h = toEvenCrop(segment.crop.height)
    const x = toEvenCrop(segment.crop.x)
    const y = toEvenCrop(segment.crop.y)
    const vLabel = `[vc${index}]`
    const aLabel = `[ac${index}]`

    videoParts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS,crop=${w}:${h}:${x}:${y}${vLabel}`
    )
    concatInputs.push(vLabel)

    if (includeAudio) {
      audioParts.push(
        `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS${aLabel}`
      )
      concatInputs.push(aLabel)
    }
  })

  const n = segments.length
  const concatIn = concatInputs.join('')
  const concatFilter = includeAudio
    ? `${concatIn}concat=n=${n}:v=1:a=1[outv][outa]`
    : `${concatIn}concat=n=${n}:v=1:a=0[outv]`

  return {
    filterComplex: [...videoParts, ...audioParts, concatFilter].join(';'),
    mapVideo: '[outv]',
    mapAudio: includeAudio ? '[outa]' : undefined
  }
}

export function isKeyframeCropMode(advanced?: FfmpegJobCropAdvanced): boolean {
  return advanced?.mode === 'keyframes' && (advanced.keyframes?.length ?? 0) > 0
}

export function getCropDurationHint(
  advanced: FfmpegJobCropAdvanced | undefined,
  fallback = 60
): number {
  if (advanced?.durationSeconds && advanced.durationSeconds > 0) {
    return advanced.durationSeconds
  }
  const sorted = sortCropKeyframes(advanced?.keyframes || [])
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : undefined
  return last ? Math.max(last.time + 1, fallback) : fallback
}
