import type { FfmpegJobConfig, FfmpegJobFilter } from './jobConfig'
import { buildXfadeJobArgs, isXfadeConcatMode } from './xfadeCommandBuilder'
import {
  buildCropSegments,
  buildKeyframeCropFilterComplex,
  getCropDurationHint,
  isKeyframeCropMode,
  toEvenCrop,
  type KeyframeCropFilterResult
} from './cropKeyframes'
import { DEFAULT_VIDEO_CODEC, resolveVideoCodec, supportsX264Preset } from './codecResolver'

interface FilterGraphResult {
  vf?: string
  filterComplex?: string
  extraInputs: string[]
}

export function formatFfmpegCommandPreview(args: string[]): string {
  return args
    .map(arg => {
      if (/\s/.test(arg) || arg.startsWith('[') || arg.includes(';') || arg.includes(':')) {
        return `"${arg.replace(/"/g, '\\"')}"`
      }
      return arg
    })
    .join(' ')
}

function appendGlobalArgs(args: string[], config: FfmpegJobConfig, options: { includeOverwrite?: boolean } = {}) {
  const includeOverwrite = options.includeOverwrite ?? true
  if (includeOverwrite && config.output?.overwrite !== false) args.push('-y')
  if (config.global?.hideBanner !== false) args.push('-hide_banner')
  if (config.global?.noStdin !== false) args.push('-nostdin')
}

function appendTimeEnable(expr: string, filter: FfmpegJobFilter): string {
  if (filter.start != null && filter.end != null) {
    return `${expr}:enable='between(t,${filter.start},${filter.end})'`
  }
  return expr
}

function normalizeOpacity(opacity?: number): number | undefined {
  if (opacity == null) return undefined
  return opacity <= 1 ? opacity * 100 : opacity
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
}

function toFfmpegColor(color?: string): string | undefined {
  if (!color) return undefined
  return color.startsWith('#') ? `0x${color.slice(1)}` : color
}

function buildDrawtextFilter(
  inputLabel: string,
  filter: Extract<FfmpegJobFilter, { type: 'drawtext' }>,
  outputLabel = ''
): string {
  const x = filter.x ?? 10
  const y = filter.y ?? 10
  const fontSize = filter.fontSize ?? 24
  const fontColor = toFfmpegColor(filter.fontColor) || 'white'
  const opacity = normalizeOpacity(filter.opacity) ?? 100
  const alpha = opacity / 100
  const drawtext = `${inputLabel}drawtext=text='${escapeDrawtextText(filter.text ?? '')}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${fontColor}@${alpha}${outputLabel}`
  return appendTimeEnable(drawtext, filter)
}

function buildWatermarkFilterChain(
  filters: FfmpegJobFilter[],
  resolvedImages: string[]
): FilterGraphResult {
  const overlayFilters = filters.filter(
    (filter): filter is Extract<FfmpegJobFilter, { type: 'overlay' }> => filter.type === 'overlay'
  )
  const extraInputs = overlayFilters
    .map((_, index) => resolvedImages[index])
    .filter((imagePath): imagePath is string => Boolean(imagePath))

  if (filters.length === 0) {
    return { extraInputs: [] }
  }

  const hasOverlay = overlayFilters.length > 0 && extraInputs.length > 0
  const hasMultiple = filters.length > 1

  if (hasOverlay || hasMultiple) {
    const filterParts: string[] = []
    let currentLabel = '[0:v]'
    let imageInputIndex = 1
    let overlayImageIndex = 0

    filters.forEach((filter, index) => {
      const isLast = index === filters.length - 1
      const outputLabel = isLast ? '' : `[v${index + 1}]`

      if (filter.type === 'drawtext') {
        filterParts.push(buildDrawtextFilter(currentLabel, filter, outputLabel))
      } else {
        const imagePath = resolvedImages[overlayImageIndex]
        overlayImageIndex += 1
        if (!imagePath) return

        const x = filter.x ?? 10
        const y = filter.y ?? 10
        const scale = filter.scale ?? 0.2
        const opacity = normalizeOpacity(filter.opacity) ?? 100
        const alpha = opacity / 100
        let processedLabel = `[${imageInputIndex}:v]`

        if (scale !== 1) {
          const scaleLabel = `[wm${index}]`
          filterParts.push(`${processedLabel}scale=iw*${scale}:ih*${scale}${scaleLabel}`)
          processedLabel = scaleLabel
        }

        if (opacity !== 100) {
          const formatLabel = `[wmf${index}]`
          const alphaLabel = `[wma${index}]`
          filterParts.push(`${processedLabel}format=rgba${formatLabel}`)
          filterParts.push(`${formatLabel}colorchannelmixer=aa=${alpha}${alphaLabel}`)
          processedLabel = alphaLabel
        }

        const overlayExpr = filter.start != null && filter.end != null
          ? `overlay=enable='between(t,${filter.start},${filter.end})':x=${x}:y=${y}`
          : `overlay=x=${x}:y=${y}`
        filterParts.push(`${currentLabel}${processedLabel}${overlayExpr}${outputLabel}`)
        imageInputIndex += 1
      }

      if (!isLast) {
        currentLabel = `[v${index + 1}]`
      }
    })

    return {
      filterComplex: filterParts.join(';'),
      extraInputs
    }
  }

  const only = filters[0]
  if (only.type === 'drawtext') {
    return { vf: buildDrawtextFilter('', only), extraInputs: [] }
  }

  const imagePath = resolvedImages[0]
  if (!imagePath) return { extraInputs: [] }

  const scale = only.scale ?? 0.2
  const x = only.x ?? 10
  const y = only.y ?? 10
  const opacity = normalizeOpacity(only.opacity) ?? 100
  const alpha = opacity / 100
  const filterParts: string[] = []
  let processedLabel = '[1:v]'

  if (scale !== 1) {
    filterParts.push(`${processedLabel}scale=iw*${scale}:ih*${scale}[wm0]`)
    processedLabel = '[wm0]'
  }
  if (opacity !== 100) {
    filterParts.push(`${processedLabel}format=rgba[wmf0]`)
    filterParts.push(`[wmf0]colorchannelmixer=aa=${alpha}[wma0]`)
    processedLabel = '[wma0]'
  }

  const overlayExpr = only.start != null && only.end != null
    ? `overlay=enable='between(t,${only.start},${only.end})':x=${x}:y=${y}`
    : `overlay=x=${x}:y=${y}`
  filterParts.push(`[0:v]${processedLabel}${overlayExpr}`)

  return {
    filterComplex: filterParts.join(';'),
    extraInputs: [imagePath]
  }
}

function appendVideoAudioArgs(args: string[], config: FfmpegJobConfig) {
  const videoCodec = resolveVideoCodec(config.video?.codec)
  const hasFilters = config.action === 'watermark' && (config.filters?.length ?? 0) > 0

  if (videoCodec) {
    args.push('-c:v', videoCodec)
  } else if (config.action === 'transcode' || config.action === 'crop' || hasFilters) {
    args.push('-c:v', DEFAULT_VIDEO_CODEC)
  }

  if (config.video?.bitrate) args.push('-b:v', config.video.bitrate)
  if (config.video?.fps) args.push('-r', String(config.video.fps))
  if (config.video?.resolution) args.push('-s', config.video.resolution)
  if (config.video?.preset && supportsX264Preset(videoCodec)) {
    args.push('-preset', config.video.preset)
  }
  if (config.video?.crf != null) args.push('-crf', String(config.video.crf))

  if (config.audio?.codec) {
    args.push('-c:a', config.audio.codec)
  } else if (hasFilters || config.action === 'watermark' || config.action === 'crop') {
    args.push('-c:a', 'copy')
  }
  if (config.audio?.bitrate) args.push('-b:a', config.audio.bitrate)
}

function toEven(value: number): number {
  return toEvenCrop(value)
}

function appendCropOutputArgs(
  args: string[],
  config: FfmpegJobConfig,
  filterResult: KeyframeCropFilterResult
) {
  args.push('-filter_complex', filterResult.filterComplex)
  args.push('-map', filterResult.mapVideo)
  if (filterResult.mapAudio) args.push('-map', filterResult.mapAudio)
  appendVideoAudioArgs(args, config)
  if (!resolveVideoCodec(config.video?.codec)) {
    args.push('-c:v', DEFAULT_VIDEO_CODEC)
  }
}

export interface BuildJobCommandOptions {
  inputPaths?: string[]
  segmentDurations?: number[]
  segmentHasAudio?: boolean[]
  targetSize?: { width: number; height: number }
}

function buildGlobalArgsPrefix(config: FfmpegJobConfig, includeOverwrite = true): string[] {
  const args: string[] = []
  appendGlobalArgs(args, config, { includeOverwrite })
  return args
}

export function buildJobCommand(
  config: FfmpegJobConfig,
  inputPath: string,
  outputPath?: string,
  resolvedImages: string[] = [],
  options: BuildJobCommandOptions = {}
): string[] {
  const args: string[] = []

  switch (config.action) {
    case 'probe':
      appendGlobalArgs(args, config, { includeOverwrite: false })
      args.push('-i', inputPath, '-f', 'null', '-', '-analyzeduration', '5000000', '-probesize', '5000000')
      return args

    case 'trim': {
      appendGlobalArgs(args, config)
      const trim = config.trim || {}
      const start = String(trim.start ?? '0')
      const duration = String(trim.duration ?? '10')
      if (!trim.precise) args.push('-ss', start)
      args.push('-i', inputPath)
      if (trim.precise) args.push('-ss', start)
      args.push('-t', duration)
      if (trim.copyStream !== false) {
        args.push('-c', 'copy')
      } else {
        appendVideoAudioArgs(args, config)
      }
      if (outputPath) args.push(outputPath)
      return args
    }

    case 'extractAudio':
      appendGlobalArgs(args, config)
      args.push('-i', inputPath, '-vn', '-acodec', config.audio?.codec || 'copy')
      if (outputPath) args.push(outputPath)
      return args

    case 'concat': {
      if (isXfadeConcatMode(config) && options.inputPaths?.length) {
        return buildXfadeJobArgs(
          config,
          {
            inputPaths: options.inputPaths,
            segmentDurations: options.segmentDurations || options.inputPaths.map(() => 10),
            segmentHasAudio: options.segmentHasAudio,
            targetSize: options.targetSize
          },
          outputPath,
          buildGlobalArgsPrefix(config)
        )
      }

      appendGlobalArgs(args, config)
      args.push('-f', 'concat', '-safe', '0', '-i', inputPath, '-c', 'copy')
      if (outputPath) args.push(outputPath)
      return args
    }

    case 'custom':
      appendGlobalArgs(args, config)
      args.push('-i', inputPath)
      if (config.args?.length) args.push(...config.args)
      if (outputPath) args.push(outputPath)
      return args

    case 'transcode':
      appendGlobalArgs(args, config)
      args.push('-i', inputPath)
      appendVideoAudioArgs(args, config)
      if (!resolveVideoCodec(config.video?.codec)) {
        args.push('-c:v', DEFAULT_VIDEO_CODEC)
      }
      if (outputPath) args.push(outputPath)
      return args

    case 'crop': {
      appendGlobalArgs(args, config)
      args.push('-i', inputPath)
      const fallbackCrop = config.crop || { x: 0, y: 0, width: 1920, height: 1080 }

      if (isKeyframeCropMode(config.cropAdvanced)) {
        const duration = getCropDurationHint(config.cropAdvanced)
        const segments = buildCropSegments(
          config.cropAdvanced!.keyframes || [],
          duration,
          fallbackCrop
        )
        const includeAudio = config.audio?.codec !== 'none'
        const filterResult = buildKeyframeCropFilterComplex(segments, { includeAudio })
        if (filterResult && segments.length > 1) {
          appendCropOutputArgs(args, config, filterResult)
          if (outputPath) args.push(outputPath)
          return args
        }
        if (filterResult && segments.length === 1) {
          const only = segments[0].crop
          const w = toEven(only.width)
          const h = toEven(only.height)
          const x = toEven(only.x)
          const y = toEven(only.y)
          args.push('-vf', `crop=${w}:${h}:${x}:${y}`)
          appendVideoAudioArgs(args, config)
          if (!resolveVideoCodec(config.video?.codec)) {
            args.push('-c:v', DEFAULT_VIDEO_CODEC)
          }
          if (outputPath) args.push(outputPath)
          return args
        }
      }

      const crop = fallbackCrop
      const w = toEven(crop.width)
      const h = toEven(crop.height)
      const x = toEven(crop.x)
      const y = toEven(crop.y)
      args.push('-vf', `crop=${w}:${h}:${x}:${y}`)
      appendVideoAudioArgs(args, config)
      if (!resolveVideoCodec(config.video?.codec)) {
        args.push('-c:v', DEFAULT_VIDEO_CODEC)
      }
      if (outputPath) args.push(outputPath)
      return args
    }

    case 'watermark': {
      appendGlobalArgs(args, config)
      const { vf, filterComplex, extraInputs = [] } = buildWatermarkFilterChain(config.filters || [], resolvedImages)
      args.push('-i', inputPath)
      extraInputs.forEach(imagePath => args.push('-i', imagePath))
      if (filterComplex) args.push('-filter_complex', filterComplex)
      else if (vf) args.push('-vf', vf)
      appendVideoAudioArgs(args, config)
      if (outputPath) args.push(outputPath)
      return args
    }

    default:
      appendGlobalArgs(args, config)
      args.push('-i', inputPath)
      if (config.args?.length) args.push(...config.args)
      if (outputPath) args.push(outputPath)
      return args
  }
}

export function previewJobCommand(
  config: FfmpegJobConfig,
  inputPath: string = '/path/to/input.mp4',
  outputPath: string = '/path/to/output.mp4',
  overlayImages: string[] = [],
  options: BuildJobCommandOptions = {}
): string {
  const ext = config.output?.format || 'mp4'
  const resolvedOutput = config.action === 'probe'
    ? outputPath
    : outputPath.replace(/\.\w+$/, `.${ext}`)

  const resolvedOverlayImages = overlayImages.length > 0
    ? overlayImages
    : config.action === 'watermark'
      ? (config.filters || [])
        .filter((filter): filter is Extract<FfmpegJobFilter, { type: 'overlay' }> => filter.type === 'overlay')
        .map(filter => filter.image || '/path/to/watermark.png')
      : []

  const previewInputPath = config.action === 'concat' && isXfadeConcatMode(config) && options.inputPaths?.length
    ? options.inputPaths[0]
    : inputPath

  const args = buildJobCommand(
    config,
    previewInputPath,
    config.action === 'probe' ? undefined : resolvedOutput,
    resolvedOverlayImages,
    options
  )

  return `ffmpeg ${formatFfmpegCommandPreview(args)}`
}
