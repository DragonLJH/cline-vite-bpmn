import type { FfmpegTaskConfig } from '../../types/bpmn'
import type { FfmpegTranscodeParams, WatermarkPosition } from './types'
import { DEFAULT_TRANSCODE_PARAMS, DEFAULT_WATERMARK_PARAMS } from './types'

export const FFMPEG_GLOBAL_FLAGS = ['-hide_banner', '-nostdin'] as const

export interface FfmpegCommandOptions {
  watermarkPath?: string
}

const WATERMARK_POSITION_OVERLAY: Record<Exclude<WatermarkPosition, 'custom'>, string> = {
  topLeft: '10:10',
  topRight: 'W-w-10:10',
  bottomLeft: '10:H-h-10',
  bottomRight: 'W-w-10:H-h-10',
  center: '(W-w)/2:(H-h)/2'
}

function getWatermarkOverlayPosition(params?: FfmpegTaskConfig['params']): string {
  const position = (params?.position as WatermarkPosition | undefined) ?? 'bottomRight'

  if (position === 'custom') {
    const x = params?.x ?? 10
    const y = params?.y ?? 10
    return `${x}:${y}`
  }

  return WATERMARK_POSITION_OVERLAY[position] ?? WATERMARK_POSITION_OVERLAY.bottomRight
}

function buildWatermarkFilterComplex(params?: FfmpegTaskConfig['params']): string {
  const scale = params?.scale ?? DEFAULT_WATERMARK_PARAMS.scale ?? 0.2
  const opacity = params?.opacity
  const overlay = getWatermarkOverlayPosition(params)

  let wmChain = `[1:v]scale=iw*${scale}:-1`
  if (opacity != null && opacity < 1) {
    wmChain += `,format=rgba,colorchannelmixer=aa=${opacity}`
  }
  wmChain += `[wm];[0:v][wm]overlay=${overlay}`

  return wmChain
}

function transcodeParamsToArgs(params?: FfmpegTranscodeParams): string[] {
  const merged = { ...DEFAULT_TRANSCODE_PARAMS, ...params }
  const args: string[] = []

  if (merged.videoCodec) args.push('-c:v', merged.videoCodec)
  if (merged.audioCodec) args.push('-c:a', merged.audioCodec)
  if (merged.videoBitrate) args.push('-b:v', merged.videoBitrate)
  if (merged.audioBitrate) args.push('-b:a', merged.audioBitrate)
  if (merged.preset) args.push('-preset', merged.preset)
  if (merged.crf != null) args.push('-crf', String(merged.crf))
  if (merged.resolution) args.push('-vf', `scale=${merged.resolution}`)
  if (merged.fps) args.push('-r', String(merged.fps))
  if (merged.extraArgs?.length) args.push(...merged.extraArgs)

  return args
}

function trimParamsToArgs(params?: FfmpegTaskConfig['params']): string[] {
  const args: string[] = [
    '-ss', String(params?.start ?? '0'),
    '-t', String(params?.duration ?? '10')
  ]

  if (params?.copyStream !== false) {
    args.push('-c', 'copy')
  }

  return args
}

function extractAudioParamsToArgs(params?: FfmpegTaskConfig['params']): string[] {
  const audioCodec = String(params?.audioCodec ?? 'copy')
  return ['-vn', '-acodec', audioCodec]
}

function watermarkParamsToArgs(params?: FfmpegTaskConfig['params']): string[] {
  const merged = { ...DEFAULT_WATERMARK_PARAMS, ...params }
  const args: string[] = [
    '-filter_complex', buildWatermarkFilterComplex(merged),
    '-c:v', String(merged.videoCodec ?? 'libopenh264'),
    '-c:a', String(merged.audioCodec ?? 'copy')
  ]

  if (merged.extraArgs?.length) {
    args.push(...merged.extraArgs)
  }

  return args
}

export function buildOperationArgs(config: FfmpegTaskConfig): string[] {
  switch (config.operation) {
    case 'probe':
      return []
    case 'trim':
      return trimParamsToArgs(config.params)
    case 'transcode':
      return transcodeParamsToArgs(config.params as FfmpegTranscodeParams | undefined)
    case 'extractAudio':
      return extractAudioParamsToArgs(config.params)
    case 'watermark':
      return watermarkParamsToArgs(config.params)
    case 'concat':
      return ['-c', 'copy']
    case 'custom':
      return config.args || (config.params?.extraArgs as string[] | undefined) || []
    default:
      return config.args || []
  }
}

export function resolveWatermarkPath(
  config: FfmpegTaskConfig,
  fallback: string = '/path/to/watermark.png'
): string {
  return String(config.params?.watermarkPath ?? fallback)
}

export function buildFfmpegCommand(
  config: FfmpegTaskConfig,
  inputPath: string,
  outputPath?: string,
  options?: FfmpegCommandOptions
): string[] {
  if (config.operation === 'probe') {
    return [...FFMPEG_GLOBAL_FLAGS, '-i', inputPath]
  }

  if (config.operation === 'watermark') {
    const watermarkPath = options?.watermarkPath ?? resolveWatermarkPath(config)
    const body = buildOperationArgs(config)
    const args: string[] = [
      ...FFMPEG_GLOBAL_FLAGS,
      '-i', inputPath,
      '-i', watermarkPath,
      ...body
    ]

    if (outputPath) {
      args.push('-y', outputPath)
    }

    return args
  }

  const body = buildOperationArgs(config)
  const args: string[] = [...FFMPEG_GLOBAL_FLAGS, '-i', inputPath, ...body]

  if (outputPath) {
    args.push('-y', outputPath)
  }

  return args
}

export function formatFfmpegCommandPreview(args: string[]): string {
  return args
    .map(arg => (/\s/.test(arg) ? `"${arg}"` : arg))
    .join(' ')
}
