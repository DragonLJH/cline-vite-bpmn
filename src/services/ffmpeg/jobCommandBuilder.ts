import type { FfmpegJobConfig, FfmpegJobFilter } from './jobConfig'
import { DEFAULT_VIDEO_CODEC, resolveVideoCodec, supportsX264Preset } from './codecResolver'

export function formatFfmpegCommandPreview(args: string[]): string {
  return args
    .map(arg => (/\s/.test(arg) ? `"${arg}"` : arg))
    .join(' ')
}

function appendGlobalArgs(args: string[], config: FfmpegJobConfig) {
  const global = config.global
  if (global?.hideBanner !== false) args.push('-hide_banner')
  if (global?.noStdin !== false) args.push('-nostdin')
}

function appendTimeEnable(expr: string, filter: FfmpegJobFilter): string {
  if (filter.start != null && filter.end != null) {
    return `${expr}:enable='between(t,${filter.start},${filter.end})'`
  }
  return expr
}

function buildDrawtextFilter(filter: Extract<FfmpegJobFilter, { type: 'drawtext' }>): string {
  const x = filter.x ?? 10
  const y = filter.y ?? 10
  const fontSize = filter.fontSize ?? 24
  const escaped = String(filter.text ?? '').replace(/'/g, "\\'")
  return appendTimeEnable(`drawtext=text='${escaped}':x=${x}:y=${y}:fontsize=${fontSize}`, filter)
}

function buildVideoFilterChain(
  config: FfmpegJobConfig,
  resolvedImages: string[]
): { vf?: string; filterComplex?: string; extraInputs: string[] } {
  const filters = config.filters || []
  if (filters.length === 0) {
    return { extraInputs: [] }
  }

  const overlayFilters = filters.filter(
    (f): f is Extract<FfmpegJobFilter, { type: 'overlay' }> => f.type === 'overlay'
  )
  const extraInputs = overlayFilters
    .map((_, index) => resolvedImages[index])
    .filter((imagePath): imagePath is string => Boolean(imagePath))

  const vfParts: string[] = []
  if (config.video?.resolution) {
    vfParts.push(`scale=${config.video.resolution}`)
  }

  const hasOverlay = overlayFilters.length > 0 && extraInputs.length > 0
  const hasMultiple = filters.length > 1

  if (hasOverlay || hasMultiple) {
    const filterParts: string[] = []
    let currentLabel = '[0:v]'
    let imageInputIndex = 1
    let overlayImageIndex = 0

    if (config.video?.resolution) {
      const scaledLabel = '[v0]'
      filterParts.push(`${currentLabel}scale=${config.video.resolution}${scaledLabel}`)
      currentLabel = scaledLabel
    }

    filters.forEach((filter, index) => {
      const isLast = index === filters.length - 1
      const outputLabel = isLast ? '' : `[v${index + 1}]`

      if (filter.type === 'drawtext') {
        filterParts.push(`${currentLabel}${buildDrawtextFilter(filter)}${outputLabel}`)
      } else if (filter.type === 'overlay') {
        const imagePath = resolvedImages[overlayImageIndex]
        overlayImageIndex += 1
        if (!imagePath) return

        const scale = filter.scale ?? 0.2
        const x = filter.x ?? 10
        const y = filter.y ?? 10
        const scaleLabel = `[wm${index}]`
        filterParts.push(`[${imageInputIndex}:v]scale=iw*${scale}:ih*${scale}${scaleLabel}`)

        const overlayExpr = filter.start != null && filter.end != null
          ? `overlay=enable='between(t,${filter.start},${filter.end})':x=${x}:y=${y}`
          : `overlay=x=${x}:y=${y}`

        filterParts.push(`${currentLabel}${scaleLabel}${overlayExpr}${outputLabel}`)
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

  const drawtextFilters = filters.filter(
    (f): f is Extract<FfmpegJobFilter, { type: 'drawtext' }> => f.type === 'drawtext'
  )
  if (drawtextFilters.length > 0) {
    vfParts.push(...drawtextFilters.map(buildDrawtextFilter))
  }

  if (vfParts.length > 0) {
    return { vf: vfParts.join(','), extraInputs: [] }
  }

  return { extraInputs: [] }
}

function appendVideoAudioArgs(args: string[], config: FfmpegJobConfig) {
  const videoCodec = resolveVideoCodec(config.video?.codec)
  const hasFilters = config.action === 'watermark' && (config.filters?.length ?? 0) > 0

  if (videoCodec) {
    args.push('-c:v', videoCodec)
  } else if (config.action === 'transcode') {
    args.push('-c:v', DEFAULT_VIDEO_CODEC)
  } else if (hasFilters) {
    args.push('-c:v', DEFAULT_VIDEO_CODEC)
  }

  if (config.video?.bitrate) args.push('-b:v', config.video.bitrate)
  if (config.video?.preset && supportsX264Preset(videoCodec)) {
    args.push('-preset', config.video.preset)
  }
  if (config.video?.crf != null) args.push('-crf', String(config.video.crf))
  if (config.video?.fps) args.push('-r', String(config.video.fps))

  if (config.audio?.codec) {
    args.push('-c:a', config.audio.codec)
  } else if (hasFilters || config.action === 'watermark') {
    args.push('-c:a', 'copy')
  }
  if (config.audio?.bitrate) args.push('-b:a', config.audio.bitrate)
}

export function buildJobCommand(
  config: FfmpegJobConfig,
  inputPath: string,
  outputPath?: string,
  resolvedImages: string[] = []
): string[] {
  const args: string[] = []
  appendGlobalArgs(args, config)

  switch (config.action) {
    case 'probe':
      args.push('-i', inputPath)
      return args

    case 'trim': {
      const trim = config.trim || {}
      const start = String(trim.start ?? '0')
      const duration = String(trim.duration ?? '10')
      if (!trim.precise) {
        args.push('-ss', start)
      }
      args.push('-i', inputPath)
      if (trim.precise) {
        args.push('-ss', start)
      }
      args.push('-t', duration)
      if (trim.copyStream !== false) {
        args.push('-c', 'copy')
      } else {
        appendVideoAudioArgs(args, config)
      }
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    case 'extractAudio': {
      args.push('-i', inputPath, '-vn', '-acodec', config.audio?.codec || 'copy')
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    case 'concat': {
      args.push('-i', inputPath, '-c', 'copy')
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    case 'custom': {
      args.push('-i', inputPath)
      if (config.args?.length) args.push(...config.args)
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    case 'transcode': {
      args.push('-i', inputPath)
      if (config.video?.resolution) {
        args.push('-vf', `scale=${config.video.resolution}`)
      }
      appendVideoAudioArgs(args, config)
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    case 'watermark': {
      const { vf, filterComplex, extraInputs = [] } = buildVideoFilterChain(config, resolvedImages)
      args.push('-i', inputPath)
      extraInputs.forEach(imagePath => args.push('-i', imagePath))
      if (filterComplex) args.push('-filter_complex', filterComplex)
      else if (vf) args.push('-vf', vf)
      appendVideoAudioArgs(args, config)
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }

    default: {
      args.push('-i', inputPath)
      if (config.args?.length) args.push(...config.args)
      if (outputPath) {
        if (config.output?.overwrite !== false) args.push('-y')
        args.push(outputPath)
      }
      return args
    }
  }
}

export function previewJobCommand(
  config: FfmpegJobConfig,
  inputPath: string = '/path/to/input.mp4',
  outputPath: string = '/path/to/output.mp4'
): string {
  const ext = config.output?.format || 'mp4'
  const resolvedOutput = config.action === 'probe'
    ? outputPath
    : outputPath.replace(/\.\w+$/, `.${ext}`)

  const overlayImages = config.action === 'watermark'
    ? (config.filters || [])
      .filter((f): f is Extract<FfmpegJobFilter, { type: 'overlay' }> => f.type === 'overlay')
      .map(f => f.image || '/path/to/watermark.png')
    : []

  const args = buildJobCommand(
    config,
    inputPath,
    config.action === 'probe' ? undefined : resolvedOutput,
    overlayImages
  )

  return `ffmpeg ${formatFfmpegCommandPreview(args)}`
}
