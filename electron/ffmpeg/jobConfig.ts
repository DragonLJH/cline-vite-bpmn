export type FfmpegJobAction =
  | 'probe'
  | 'trim'
  | 'transcode'
  | 'watermark'
  | 'extractAudio'
  | 'concat'
  | 'custom'

export interface FfmpegJobInput {
  source?: string
  path?: string
}

export interface FfmpegJobOutput {
  format?: string
  overwrite?: boolean
  var?: string
}

export interface FfmpegJobVideo {
  codec?: string
  bitrate?: string
  fps?: number
  resolution?: string
  preset?: string
  crf?: number
}

export interface FfmpegJobAudio {
  codec?: string
  bitrate?: string
}

export interface FfmpegDrawtextFilter {
  type: 'drawtext'
  text: string
  x?: number
  y?: number
  fontSize?: number
  fontColor?: string
  opacity?: number
  start?: string
  end?: string
}

export interface FfmpegOverlayFilter {
  type: 'overlay'
  image: string
  x?: number
  y?: number
  scale?: number
  opacity?: number
  start?: string
  end?: string
}

export type FfmpegJobFilter = FfmpegDrawtextFilter | FfmpegOverlayFilter

export interface FfmpegJobGlobal {
  hideBanner?: boolean
  noStdin?: boolean
}

export interface FfmpegJobTrim {
  start?: string
  duration?: string
  copyStream?: boolean
  precise?: boolean
}

export interface FfmpegJobConfig {
  type: 'ffmpeg'
  action: FfmpegJobAction
  input?: FfmpegJobInput
  output?: FfmpegJobOutput
  video?: FfmpegJobVideo
  audio?: FfmpegJobAudio
  filters?: FfmpegJobFilter[]
  global?: FfmpegJobGlobal
  trim?: FfmpegJobTrim
  args?: string[]
}

export function getJobOutputFormat(config: FfmpegJobConfig): string {
  if (config.output?.format) return config.output.format
  switch (config.action) {
    case 'extractAudio':
      return 'aac'
    case 'probe':
      return 'json'
    default:
      return 'mp4'
  }
}

export function parseTrimDuration(config: FfmpegJobConfig): number | undefined {
  const duration = config.trim?.duration
  if (duration == null) return undefined
  const parsed = parseFloat(String(duration))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
