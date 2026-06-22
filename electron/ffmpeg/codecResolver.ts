const VIDEO_CODEC_FALLBACK: Record<string, string> = {
  libx264: 'libopenh264',
  x264: 'libopenh264',
  h264: 'libopenh264',
  libx265: 'libopenh264',
  x265: 'libopenh264',
  hevc: 'libopenh264'
}

const X264_PRESET_CODECS = new Set(['libx264'])

export function resolveVideoCodec(codec?: string): string | undefined {
  if (!codec || codec === 'copy') return codec
  return VIDEO_CODEC_FALLBACK[codec] ?? codec
}

export function supportsX264Preset(codec?: string): boolean {
  if (!codec) return false
  return X264_PRESET_CODECS.has(codec)
}

export const DEFAULT_VIDEO_CODEC = 'libopenh264'
