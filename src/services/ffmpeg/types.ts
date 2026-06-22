/** 各 operation 共用的输出扩展名等基础字段 */
export interface FfmpegBaseParams {
  ext?: string
}

export interface FfmpegTrimParams extends FfmpegBaseParams {
  start?: string
  duration?: string
  copyStream?: boolean
}

export interface FfmpegTranscodeParams extends FfmpegBaseParams {
  videoCodec?: string
  audioCodec?: string
  videoBitrate?: string
  audioBitrate?: string
  resolution?: string
  fps?: number
  preset?: string
  crf?: number
  extraArgs?: string[]
}

export interface FfmpegExtractAudioParams extends FfmpegBaseParams {
  audioCodec?: string
}

export type WatermarkPosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center' | 'custom'

export interface FfmpegWatermarkParams extends FfmpegBaseParams {
  watermarkPath?: string
  watermarkVar?: string
  position?: WatermarkPosition
  x?: number | string
  y?: number | string
  scale?: number
  opacity?: number
  videoCodec?: string
  audioCodec?: string
  extraArgs?: string[]
}

export type FfmpegParams = FfmpegBaseParams &
  FfmpegTrimParams &
  FfmpegTranscodeParams &
  FfmpegExtractAudioParams &
  FfmpegWatermarkParams &
  Record<string, string | number | boolean | string[] | undefined>

export const VIDEO_CODEC_OPTIONS = [
  { value: 'libopenh264', label: 'H.264 (libopenh264，内置 FFmpeg 推荐)' },
  { value: 'libx264', label: 'H.264 (libx264，需系统 FFmpeg)' },
  { value: 'libx265', label: 'H.265 (libx265)' },
  { value: 'copy', label: '复制 (copy)' },
  { value: 'libvpx-vp9', label: 'VP9 (libvpx-vp9)' }
] as const

export const AUDIO_CODEC_OPTIONS = [
  { value: 'aac', label: 'AAC' },
  { value: 'copy', label: '复制 (copy)' },
  { value: 'libmp3lame', label: 'MP3 (libmp3lame)' }
] as const

export const PRESET_OPTIONS = [
  { value: 'ultrafast', label: 'ultrafast' },
  { value: 'fast', label: 'fast' },
  { value: 'medium', label: 'medium' },
  { value: 'slow', label: 'slow' }
] as const

export const DEFAULT_TRANSCODE_PARAMS: FfmpegTranscodeParams = {
  videoCodec: 'libopenh264',
  audioCodec: 'aac'
}

export const DEFAULT_TRIM_PARAMS: FfmpegTrimParams = {
  start: '0',
  duration: '10',
  copyStream: true
}

export const DEFAULT_EXTRACT_AUDIO_PARAMS: FfmpegExtractAudioParams = {
  audioCodec: 'copy',
  ext: 'aac'
}

export const WATERMARK_POSITION_OPTIONS = [
  { value: 'topLeft', label: '左上角' },
  { value: 'topRight', label: '右上角' },
  { value: 'bottomLeft', label: '左下角' },
  { value: 'bottomRight', label: '右下角' },
  { value: 'center', label: '居中' },
  { value: 'custom', label: '自定义' }
] as const

export const DEFAULT_WATERMARK_PARAMS: FfmpegWatermarkParams = {
  position: 'bottomRight',
  scale: 0.2,
  videoCodec: 'libopenh264',
  audioCodec: 'copy',
  ext: 'mp4'
}
