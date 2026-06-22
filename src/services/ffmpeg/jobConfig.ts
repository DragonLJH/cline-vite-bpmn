import { DEFAULT_VIDEO_CODEC, resolveVideoCodec } from './codecResolver'

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

/** 旧版节点配置（读取 BPMN 时自动迁移） */
export interface LegacyFfmpegTaskConfig {
  operation?: string
  inputVar?: string
  outputVar?: string
  params?: Record<string, unknown>
  args?: string[]
}

export const DEFAULT_FFMPEG_JOB_CONFIG: FfmpegJobConfig = {
  type: 'ffmpeg',
  action: 'transcode',
  input: { source: 'input' },
  output: { format: 'mp4', overwrite: true, var: 'output' },
  video: { codec: DEFAULT_VIDEO_CODEC },
  audio: { codec: 'aac' },
  global: { hideBanner: true, noStdin: true }
}

function normalizeJobConfig(config: FfmpegJobConfig): FfmpegJobConfig {
  let next = config

  if (next.action === 'transcode' && (next.filters?.length ?? 0) > 0) {
    const { video: _video, audio: _audio, ...rest } = next
    next = { ...rest, action: 'watermark' }
  }

  if (!next.video?.codec) return next
  const resolved = resolveVideoCodec(next.video.codec)
  if (resolved === next.video.codec) return next
  return {
    ...next,
    video: { ...next.video, codec: resolved }
  }
}

export const FFMPEG_ACTION_LABELS: Record<FfmpegJobAction, string> = {
  probe: '探测信息',
  trim: '裁剪',
  transcode: '转码',
  watermark: '水印',
  extractAudio: '提取音频',
  concat: '合并',
  custom: '自定义'
}

export function isFfmpegJobConfig(value: unknown): value is FfmpegJobConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as FfmpegJobConfig).type === 'ffmpeg' &&
    typeof (value as FfmpegJobConfig).action === 'string'
  )
}

function defaultFormatForAction(action: FfmpegJobAction): string {
  switch (action) {
    case 'extractAudio':
      return 'aac'
    case 'probe':
      return 'json'
    default:
      return 'mp4'
  }
}

function parseInputSource(inputVar?: string): string {
  if (!inputVar) return 'input'
  const match = inputVar.trim().match(/^\$\{(.+)\}$/)
  const key = match ? match[1] : inputVar.trim()
  if (key === 'input') return 'input'
  return key
}

function parseOutputVar(outputVar?: string): string | undefined {
  if (!outputVar) return undefined
  const match = outputVar.trim().match(/^\$\{(.+)\}$/)
  return match ? match[1] : outputVar.trim()
}

export function legacyToJobConfig(legacy: LegacyFfmpegTaskConfig): FfmpegJobConfig {
  const operation = legacy.operation || 'transcode'
  const params = legacy.params || {}

  let action: FfmpegJobAction
  if (operation === 'watermark') {
    action = 'watermark'
  } else if (
    operation === 'probe' ||
    operation === 'trim' ||
    operation === 'transcode' ||
    operation === 'extractAudio' ||
    operation === 'concat' ||
    operation === 'custom'
  ) {
    action = operation
  } else {
    action = 'transcode'
  }

  const config: FfmpegJobConfig = {
    type: 'ffmpeg',
    action,
    input: { source: parseInputSource(legacy.inputVar) },
    output: {
      format: String(params.ext ?? defaultFormatForAction(action)),
      overwrite: true,
      var: parseOutputVar(legacy.outputVar) ?? 'output'
    },
    global: { hideBanner: true, noStdin: true }
  }

  if (action === 'trim' || operation === 'trim') {
    config.trim = {
      start: String(params.start ?? '0'),
      duration: String(params.duration ?? '10'),
      copyStream: params.copyStream !== false
    }
  }

  if (action === 'transcode') {
    config.video = {
      codec: resolveVideoCodec(params.videoCodec as string | undefined),
      bitrate: params.videoBitrate as string | undefined,
      fps: params.fps as number | undefined,
      resolution: params.resolution as string | undefined,
      preset: params.preset as string | undefined,
      crf: params.crf as number | undefined
    }
    config.audio = {
      codec: params.audioCodec as string | undefined,
      bitrate: params.audioBitrate as string | undefined
    }
  }

  if (action === 'watermark' || operation === 'watermark') {
    config.filters = [{
      type: 'overlay',
      image: String(params.watermarkPath ?? ''),
      scale: typeof params.scale === 'number' ? params.scale : undefined,
      opacity: typeof params.opacity === 'number' ? params.opacity : undefined
    }]
  }

  if (action === 'extractAudio') {
    config.audio = {
      codec: String(params.audioCodec ?? 'copy')
    }
  }

  if (action === 'custom') {
    const extraArgs = Array.isArray(params.extraArgs)
      ? (params.extraArgs as string[])
      : legacy.args
    if (extraArgs?.length) {
      config.args = [...extraArgs]
    }
  }

  return config
}

function decodeJsonAttribute(json: string): string {
  return json
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function mergeJobConfig(parsed: Partial<FfmpegJobConfig>): FfmpegJobConfig {
  const merged: FfmpegJobConfig = {
    ...DEFAULT_FFMPEG_JOB_CONFIG,
    ...parsed,
    input: { ...DEFAULT_FFMPEG_JOB_CONFIG.input, ...parsed.input },
    output: { ...DEFAULT_FFMPEG_JOB_CONFIG.output, ...parsed.output },
    global: { ...DEFAULT_FFMPEG_JOB_CONFIG.global, ...parsed.global }
  }

  if (parsed.video) {
    merged.video = { ...DEFAULT_FFMPEG_JOB_CONFIG.video, ...parsed.video }
  }
  if (parsed.audio) {
    merged.audio = { ...DEFAULT_FFMPEG_JOB_CONFIG.audio, ...parsed.audio }
  }
  if (parsed.trim) {
    merged.trim = { ...parsed.trim }
  }
  if (parsed.filters) {
    merged.filters = parsed.filters.map(filter => ({ ...filter }))
  }
  if (parsed.args) {
    merged.args = [...parsed.args]
  }

  if (merged.action === 'watermark') {
    if (!parsed.video) delete merged.video
    if (!parsed.audio) delete merged.audio
    if (!merged.filters) merged.filters = []
  }

  if (merged.action === 'transcode' && merged.filters) {
    delete merged.filters
  }

  return normalizeJobConfig(merged)
}

export function parseFfmpegJobConfig(json?: string | null): FfmpegJobConfig {
  if (!json) return { ...DEFAULT_FFMPEG_JOB_CONFIG }

  const decoded = decodeJsonAttribute(json.trim())

  try {
    const parsed = JSON.parse(decoded) as unknown
    if (isFfmpegJobConfig(parsed)) {
      return mergeJobConfig(parsed)
    }
    return mergeJobConfig(legacyToJobConfig(parsed as LegacyFfmpegTaskConfig))
  } catch (error) {
    console.warn('[FFmpeg] 配置 JSON 解析失败，已使用默认配置:', decoded.slice(0, 200), error)
    return { ...DEFAULT_FFMPEG_JOB_CONFIG }
  }
}

export function serializeFfmpegJobConfig(config: FfmpegJobConfig): string {
  return JSON.stringify(config)
}

export function getJobOutputFormat(config: FfmpegJobConfig): string {
  return config.output?.format || defaultFormatForAction(config.action)
}

export function resolveJobInput(
  config: FfmpegJobConfig,
  context: Record<string, unknown>,
  options: { inputFilePath: string; prevOutput?: string }
): string {
  if (config.input?.path) {
    return config.input.path
  }

  const source = config.input?.source ?? 'input'

  if (source === 'input') {
    const value = context.input
    return typeof value === 'string' ? value : options.inputFilePath
  }

  if (source === 'prev') {
    if (options.prevOutput) return options.prevOutput
    const fallback = context.input
    if (typeof fallback === 'string') return fallback
    return options.inputFilePath
  }

  const value = context[source]
  if (typeof value === 'string') return value

  const legacyMatch = source.match(/^\$\{(.+)\}$/)
  if (legacyMatch) {
    const legacyValue = context[legacyMatch[1]]
    if (typeof legacyValue === 'string') return legacyValue
  }

  throw new Error(`无法解析输入源: ${source}`)
}

export function resolveFilterImage(
  image: string,
  context: Record<string, unknown>
): string {
  const trimmed = image.trim()
  const match = trimmed.match(/^\$\{(.+)\}$/)
  const key = match ? match[1] : trimmed
  const value = context[key]
  if (typeof value === 'string' && value) return value
  if (!match && trimmed) return trimmed
  throw new Error(`无法解析水印图片路径: ${image}`)
}

export function getJobOutputVar(config: FfmpegJobConfig, stepId: string): string {
  return config.output?.var || `${stepId}.output`
}

export function parseTrimDuration(config: FfmpegJobConfig): number | undefined {
  const duration = config.trim?.duration
  if (duration == null) return undefined
  const parsed = parseFloat(String(duration))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}
