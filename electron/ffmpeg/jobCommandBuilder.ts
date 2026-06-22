import { FFmpegCommandBuilder, type WatermarkItem } from './FFmpegCommandBuilder'
import type { FfmpegJobConfig, FfmpegJobFilter } from './jobConfig'
import { DEFAULT_VIDEO_CODEC, resolveVideoCodec, supportsX264Preset } from './codecResolver'

function normalizeOpacity(opacity?: number): number | undefined {
  if (opacity == null) return undefined
  return opacity <= 1 ? opacity * 100 : opacity
}

function filtersToWatermarkItems(
  filters: FfmpegJobFilter[],
  resolvedImages: string[]
): WatermarkItem[] {
  let overlayIndex = 0

  return filters.flatMap((filter): WatermarkItem[] => {
    if (filter.type === 'drawtext') {
      return [{
        type: 'text',
        text: filter.text,
        x: filter.x,
        y: filter.y,
        fontSize: filter.fontSize,
        fontColor: filter.fontColor,
        start: filter.start,
        end: filter.end,
        opacity: normalizeOpacity(filter.opacity)
      }]
    }

    const imagePath = resolvedImages[overlayIndex]
    overlayIndex += 1
    if (!imagePath) return []

    return [{
      type: 'image',
      image: imagePath,
      x: filter.x,
      y: filter.y,
      size: filter.scale != null ? Math.round(filter.scale * 100) : undefined,
      start: filter.start,
      end: filter.end,
      opacity: normalizeOpacity(filter.opacity)
    }]
  })
}

function applyGlobal(builder: FFmpegCommandBuilder, config: FfmpegJobConfig) {
  if (config.output?.overwrite !== false) {
    builder.overwrite()
  }
  if (config.global?.hideBanner !== false) {
    builder.global('-hide_banner')
  }
  if (config.global?.noStdin !== false) {
    builder.global('-nostdin')
  }
}

function applyVideoAudio(builder: FFmpegCommandBuilder, config: FfmpegJobConfig) {
  const videoCodec = resolveVideoCodec(config.video?.codec)
  if (videoCodec) builder.videoCodec(videoCodec)
  if (config.video?.bitrate) builder.bitrate(config.video.bitrate)
  if (config.video?.preset && supportsX264Preset(videoCodec)) {
    builder.preset(config.video.preset)
  }
  if (config.video?.crf != null) builder.custom('-crf', String(config.video.crf))
  if (config.video?.resolution) builder.size(config.video.resolution)
  if (config.video?.fps) builder.fps(config.video.fps)
  const isWatermark = config.action === 'watermark'
  if (config.audio?.codec) {
    builder.audioCodec(config.audio.codec)
  } else if (isWatermark) {
    builder.audioCodec('copy')
  }
  if (config.audio?.bitrate) builder.audioBitrate(config.audio.bitrate)
}

function applyFilters(
  builder: FFmpegCommandBuilder,
  filters: FfmpegJobFilter[],
  resolvedImages: string[]
) {
  if (filters.length === 0) return

  const hasOverlay = filters.some(filter => filter.type === 'overlay')
  const hasMultiple = filters.length > 1

  if (hasOverlay || hasMultiple) {
    const items = filtersToWatermarkItems(filters, resolvedImages)
    if (items.length > 0) {
      builder.watermarks(items)
    }
    return
  }

  const filter = filters[0]
  if (filter.type === 'drawtext') {
    builder.textWatermark({
      text: filter.text,
      x: filter.x,
      y: filter.y,
      fontSize: filter.fontSize,
      fontColor: filter.fontColor,
      opacity: normalizeOpacity(filter.opacity),
      start: filter.start,
      end: filter.end
    })
    return
  }

  if (filter.type === 'overlay') {
    const imagePath = resolvedImages[0]
    if (!imagePath) return

    const sizePercent = filter.scale != null ? Math.round(filter.scale * 100) : undefined
    builder.watermark(
      imagePath,
      filter.x ?? 10,
      filter.y ?? 10,
      filter.start,
      filter.end,
      sizePercent
    )
  }
}

export function buildJobCommand(
  config: FfmpegJobConfig,
  inputPath: string,
  outputPath?: string,
  resolvedImages: string[] = []
): string[] {
  const builder = new FFmpegCommandBuilder()

  switch (config.action) {
    case 'probe':
      applyGlobal(builder, config)
      builder.input(inputPath)
      return builder.build()

    case 'trim': {
      applyGlobal(builder, config)
      const trim = config.trim || {}
      builder.input(inputPath)
      if (trim.precise) {
        builder.seekOutput(String(trim.start ?? '0'))
      } else {
        builder.seekInput(String(trim.start ?? '0'))
      }
      builder.duration(String(trim.duration ?? '10'))
      if (trim.copyStream !== false) {
        builder.custom('-c', 'copy')
      }
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    case 'extractAudio': {
      applyGlobal(builder, config)
      builder.input(inputPath)
      builder.custom('-vn')
      builder.audioCodec(config.audio?.codec || 'copy')
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    case 'concat': {
      applyGlobal(builder, config)
      builder.input(inputPath)
      builder.custom('-c', 'copy')
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    case 'custom': {
      applyGlobal(builder, config)
      builder.input(inputPath)
      if (config.args?.length) builder.custom(...config.args)
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    case 'transcode': {
      applyGlobal(builder, config)
      builder.input(inputPath)
      applyVideoAudio(builder, config)
      if (!resolveVideoCodec(config.video?.codec)) {
        builder.videoCodec(DEFAULT_VIDEO_CODEC)
      }
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    case 'watermark': {
      applyGlobal(builder, config)
      builder.input(inputPath)
      if (config.filters?.length) {
        applyFilters(builder, config.filters, resolvedImages)
      }
      builder.videoCodec(resolveVideoCodec(config.video?.codec) || DEFAULT_VIDEO_CODEC)
      builder.audioCodec(config.audio?.codec || 'copy')
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }

    default: {
      applyGlobal(builder, config)
      builder.input(inputPath)
      if (config.args?.length) builder.custom(...config.args)
      if (outputPath) builder.output(outputPath)
      return builder.build()
    }
  }
}
