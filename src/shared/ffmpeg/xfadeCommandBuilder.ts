import type { FfmpegJobConfig, FfmpegJobConcat } from './jobConfig'
import {
  DEFAULT_VIDEO_CODEC,
  getVideoRateControl,
  resolveVideoCodec,
  supportsX264Preset
} from './codecResolver'

export const DEFAULT_XFADE_TRANSITION = 'fade'
export const DEFAULT_XFADE_DURATION = 0.5
export const DEFAULT_XFADE_FPS = 30
export const DEFAULT_XFADE_SCALE = '1920:1080'

/** FFmpeg xfade 支持的常用转场（fade = 淡入淡出） */
export const XFADE_TRANSITION_OPTIONS = [
  { value: 'fade', label: '淡入淡出 (fade)' },
  { value: 'fadeblack', label: '黑场淡化' },
  { value: 'fadewhite', label: '白场淡化' },
  { value: 'dissolve', label: '溶解 (dissolve)' },
  { value: 'wiperight', label: '向右擦除' },
  { value: 'wipeleft', label: '向左擦除' },
  { value: 'slideleft', label: '向左滑动' },
  { value: 'slideright', label: '向右滑动' },
  { value: 'circleopen', label: '圆形展开' },
  { value: 'circleclose', label: '圆形收缩' }
] as const

const VALID_XFADE_TRANSITIONS = new Set(XFADE_TRANSITION_OPTIONS.map(opt => opt.value))

export interface XfadeCommandOptions {
  inputPaths: string[]
  segmentDurations: number[]
  segmentHasAudio?: boolean[]
  targetSize?: { width: number; height: number }
}

function getConcatSettings(config: FfmpegJobConfig): Required<Pick<FfmpegJobConcat, 'transition' | 'duration' | 'fps' | 'scaleTo'>> {
  const concat: FfmpegJobConcat = config.concat || { mode: 'copy' }
  return {
    transition: concat.transition || DEFAULT_XFADE_TRANSITION,
    duration: concat.duration ?? DEFAULT_XFADE_DURATION,
    fps: concat.fps ?? DEFAULT_XFADE_FPS,
    scaleTo: concat.scaleTo || 'first'
  }
}

function toEvenDimension(value: number): number {
  const n = Math.max(2, Math.floor(value))
  return n % 2 === 0 ? n : n - 1
}

function sanitizeTransition(transition: string): string {
  const normalized = transition.trim().toLowerCase()
  return VALID_XFADE_TRANSITIONS.has(normalized as typeof XFADE_TRANSITION_OPTIONS[number]['value'])
    ? normalized
    : DEFAULT_XFADE_TRANSITION
}

function resolveTargetSize(
  scaleTo: string,
  targetSize?: { width: number; height: number }
): { width: number; height: number } {
  if (scaleTo !== 'first') {
    const [w, h] = scaleTo.split(':').map(Number)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: toEvenDimension(w), height: toEvenDimension(h) }
    }
  }
  if (targetSize?.width && targetSize?.height) {
    return { width: toEvenDimension(targetSize.width), height: toEvenDimension(targetSize.height) }
  }
  const [w, h] = DEFAULT_XFADE_SCALE.split(':').map(Number)
  return { width: toEvenDimension(w), height: toEvenDimension(h) }
}

function buildNormalizeVideoFilter(
  index: number,
  fps: number,
  target: { width: number; height: number }
): string {
  const input = `[${index}:v]`
  const output = `[vn${index}]`
  // xfade 要求恒定帧率(CFR)；copy/trim 输出可能缺 fps 元数据，需先重置时间轴再 fps+format
  return `${input}settb=AVTB,setpts=PTS-STARTPTS,fps=${fps},setsar=1,format=yuv420p,scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2${output}`
}

function buildNormalizeAudioFilter(index: number, hasAudio: boolean, duration: number): string {
  if (hasAudio) {
    return `[${index}:a]asetpts=PTS-STARTPTS[an${index}]`
  }
  return `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${duration},asetpts=PTS-STARTPTS[an${index}]`
}

export function computeXfadeOffsets(durations: number[], fadeDuration: number): number[] {
  const offsets: number[] = []
  let accumulated = 0

  for (let i = 0; i < durations.length - 1; i += 1) {
    accumulated += durations[i]
    const raw = accumulated - (i + 1) * fadeDuration
    const maxOffset = Math.max(0, durations[i] - fadeDuration - 0.05)
    offsets.push(Math.max(0, Math.min(raw, maxOffset)))
  }

  return offsets
}

export function validateXfadeInputs(durations: number[], fadeDuration: number): string | null {
  if (durations.length < 2) {
    return '交叉淡化合并至少需要 2 个输入文件'
  }
  if (fadeDuration <= 0) {
    return '转场时长必须大于 0'
  }
  const tooShort = durations.findIndex(duration => duration <= fadeDuration)
  if (tooShort >= 0) {
    return `第 ${tooShort + 1} 段时长 (${durations[tooShort]}s) 短于转场时长 (${fadeDuration}s)`
  }
  return null
}

export function buildXfadeFilterComplex(
  config: FfmpegJobConfig,
  options: XfadeCommandOptions
): { filterComplex: string; mapVideo: string; mapAudio?: string } {
  const { inputPaths, segmentDurations, segmentHasAudio, targetSize } = options
  const settings = getConcatSettings(config)
  const validationError = validateXfadeInputs(segmentDurations, settings.duration)
  if (validationError) {
    throw new Error(validationError)
  }

  const target = resolveTargetSize(settings.scaleTo, targetSize)
  const hasAudioFlags = segmentHasAudio?.length === inputPaths.length
    ? segmentHasAudio
    : inputPaths.map(() => true)

  const videoParts = inputPaths.map((_, index) =>
    buildNormalizeVideoFilter(index, settings.fps, target)
  )

  const audioParts = inputPaths.map((_, index) =>
    buildNormalizeAudioFilter(index, hasAudioFlags[index], segmentDurations[index])
  )

  const offsets = computeXfadeOffsets(segmentDurations, settings.duration)
  const fadeDuration = settings.duration
  const transition = sanitizeTransition(settings.transition)

  let currentVideo = '[vn0]'
  let currentAudio = '[an0]'

  for (let i = 0; i < inputPaths.length - 1; i += 1) {
    const isLast = i === inputPaths.length - 2
    const nextVideo = `[vn${i + 1}]`
    const nextAudio = `[an${i + 1}]`
    const videoOut = isLast ? '[outv]' : `[xv${i + 1}]`
    const audioOut = isLast ? '[outa]' : `[xa${i + 1}]`

    videoParts.push(
      `${currentVideo}${nextVideo}xfade=transition=${transition}:duration=${fadeDuration}:offset=${offsets[i].toFixed(3)}${videoOut}`
    )
    audioParts.push(
      `${currentAudio}${nextAudio}acrossfade=d=${fadeDuration}:c1=tri:c2=tri${audioOut}`
    )

    currentVideo = videoOut
    currentAudio = audioOut
  }

  return {
    filterComplex: [...videoParts, ...audioParts].join(';'),
    mapVideo: '[outv]',
    mapAudio: '[outa]'
  }
}

function appendVideoAudioArgs(args: string[], config: FfmpegJobConfig) {
  const videoCodec = resolveVideoCodec(config.video?.codec) || DEFAULT_VIDEO_CODEC
  const rate = getVideoRateControl(videoCodec, config.video)
  args.push('-c:v', videoCodec)
  if (rate.bitrate) {
    args.push('-b:v', rate.bitrate)
  } else {
    if (rate.crf != null) args.push('-crf', String(rate.crf))
    if (rate.preset && supportsX264Preset(videoCodec)) args.push('-preset', rate.preset)
  }

  const audioCodec = config.audio?.codec || 'aac'
  args.push('-c:a', audioCodec)
  if (config.audio?.bitrate) args.push('-b:a', config.audio.bitrate)
  else args.push('-b:a', '128k')
}

export function buildXfadeJobArgs(
  config: FfmpegJobConfig,
  options: XfadeCommandOptions,
  outputPath?: string,
  globalArgs: string[] = []
): string[] {
  const args = [...globalArgs]
  options.inputPaths.forEach(path => {
    args.push('-i', path)
  })

  const filterResult = buildXfadeFilterComplex(config, options)
  args.push('-filter_complex', filterResult.filterComplex)
  args.push('-map', filterResult.mapVideo)
  if (filterResult.mapAudio) args.push('-map', filterResult.mapAudio)
  appendVideoAudioArgs(args, config)
  if (outputPath) args.push(outputPath)
  return args
}

export function isXfadeConcatMode(config: FfmpegJobConfig): boolean {
  return config.action === 'concat' && config.concat?.mode === 'xfade'
}
