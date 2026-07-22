/**
 * 内置 FFmpeg 二进制（public/ffmpeg）可用的软件编码器与常见别名映射。
 * 例如 Windows 包不含 libx264，但包含 libopenh264。
 */
const VIDEO_CODEC_FALLBACK: Record<string, string> = {
  libx264: 'libopenh264',
  x264: 'libopenh264',
  h264: 'libopenh264',
  libx265: 'libopenh264',
  x265: 'libopenh264',
  hevc: 'libopenh264'
}

const X264_PRESET_CODECS = new Set(['libx264'])

export const DEFAULT_OPENH264_BITRATE = '1200k'

export interface VideoRateControl {
  bitrate?: string
  crf?: number
  preset?: string
}

export function resolveVideoCodec(codec?: string): string | undefined {
  if (!codec || codec === 'copy') return codec
  return VIDEO_CODEC_FALLBACK[codec] ?? codec
}

export function supportsX264Preset(codec?: string): boolean {
  if (!codec) return false
  const resolved = resolveVideoCodec(codec)
  return resolved ? X264_PRESET_CODECS.has(resolved) : false
}

export function getVideoRateControl(
  codec?: string,
  video?: { bitrate?: string; crf?: number; preset?: string }
): VideoRateControl {
  const resolved = resolveVideoCodec(codec) || DEFAULT_VIDEO_CODEC
  if (video?.bitrate) return { bitrate: video.bitrate }
  if (supportsX264Preset(resolved)) {
    return { crf: video?.crf ?? 23, preset: video?.preset ?? 'medium' }
  }
  return { bitrate: DEFAULT_OPENH264_BITRATE }
}

export function sanitizeVideoEncoding<T extends { codec?: string; bitrate?: string; crf?: number; preset?: string }>(
  video?: T
): T | undefined {
  if (!video) return undefined
  const resolved = resolveVideoCodec(video.codec) || DEFAULT_VIDEO_CODEC
  const next = { ...video, codec: resolved } as T
  if (!supportsX264Preset(resolved)) {
    delete next.crf
    delete next.preset
    if (!next.bitrate) next.bitrate = DEFAULT_OPENH264_BITRATE
  } else if (!next.crf && !next.bitrate) {
    next.crf = 23
    next.preset = next.preset ?? 'medium'
  }
  return next
}

export const DEFAULT_VIDEO_CODEC = 'libopenh264'
