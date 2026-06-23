import * as fs from 'fs'
import * as path from 'path'
import { appLogger } from '../logging/appLogger'
import type { ImageWatermarkItem, TextWatermarkItem, WatermarkItem } from './FFmpegCommandBuilder'

const WINDOWS_FONT_CANDIDATES: Record<string, string[]> = {
  '': ['msyh.ttc', 'simhei.ttf', 'simsun.ttc', 'arial.ttf'],
  Arial: ['arial.ttf'],
  'Times New Roman': ['times.ttf'],
  'Courier New': ['cour.ttf'],
  Georgia: ['georgia.ttf'],
  Verdana: ['verdana.ttf'],
  SimHei: ['simhei.ttf'],
  SimSun: ['simsun.ttc'],
  'Microsoft YaHei': ['msyh.ttc', 'msyh.ttf'],
  KaiTi: ['simkai.ttf']
}

function resolveFontFile(fontFamily?: string): string | undefined {
  if (process.platform !== 'win32') return undefined

  const fontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  const candidates = [
    ...(WINDOWS_FONT_CANDIDATES[fontFamily || ''] || []),
    ...WINDOWS_FONT_CANDIDATES['']
  ]

  for (const candidate of candidates) {
    const fontPath = path.join(fontsDir, candidate)
    if (fs.existsSync(fontPath)) {
      return fontPath
    }
  }

  return undefined
}

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
}

function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

function toFfmpegColor(color: string): string {
  return color.startsWith('#') ? `0x${color.slice(1)}` : color
}

export interface WatermarkFilterGraph {
  imageInputs: string[]
  filterComplex: string
}

export function buildWatermarkFilterGraph(watermarks: WatermarkItem[]): WatermarkFilterGraph {
  appLogger.info('FFmpegCommandBuilder building watermarks', {
    count: watermarks.length,
    watermarkTypes: watermarks.map(watermark => watermark.type)
  })

  const imageInputs = watermarks
    .filter((watermark): watermark is ImageWatermarkItem => watermark.type === 'image')
    .map(watermark => watermark.image)
  const filterParts: string[] = []
  let currentLabel = '[0:v]'
  let imageInputIndex = 1

  watermarks.forEach((watermark, index) => {
    const isLast = index === watermarks.length - 1
    const outputLabel = isLast ? '' : `[v${index + 1}]`

    if (watermark.type === 'image') {
      const imageWm = watermark as ImageWatermarkItem
      const x = imageWm.x ?? 10
      const y = imageWm.y ?? 10
      const opacity = imageWm.opacity ?? 100
      const alphaValue = opacity / 100
      let processedLabel = `[${imageInputIndex}:v]`

      if (imageWm.size !== undefined && imageWm.size !== 100) {
        const scaleRatio = imageWm.size / 100
        const scaleLabel = `[wm${index}]`
        filterParts.push(`${processedLabel}scale=iw*${scaleRatio}:ih*${scaleRatio}${scaleLabel}`)
        processedLabel = scaleLabel
      }

      if (opacity !== 100) {
        const formatLabel = `[wmf${index}]`
        const alphaLabel = `[wma${index}]`
        filterParts.push(`${processedLabel}format=rgba${formatLabel}`)
        filterParts.push(`${formatLabel}colorchannelmixer=aa=${alphaValue}${alphaLabel}`)
        processedLabel = alphaLabel
      }

      const overlayFilter = imageWm.start !== undefined && imageWm.end !== undefined
        ? `${currentLabel}${processedLabel}overlay=enable='between(t,${imageWm.start},${imageWm.end})':x=${x}:y=${y}${outputLabel}`
        : `${currentLabel}${processedLabel}overlay=x=${x}:y=${y}${outputLabel}`
      filterParts.push(overlayFilter)
      imageInputIndex += 1
    } else {
      const textWm = watermark as TextWatermarkItem
      const {
        text,
        x = 10,
        y = 10,
        fontSize = 24,
        fontColor = 'white',
        fontFamily,
        start,
        end,
        opacity = 100,
        backgroundColor,
        borderWidth,
        borderColor,
        shadow
      } = textWm

      const alphaValue = opacity / 100
      const fontFile = resolveFontFile(fontFamily)
      let drawtextFilter = `${currentLabel}drawtext=text='${escapeDrawtextText(text)}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${toFfmpegColor(fontColor)}@${alphaValue}`

      if (fontFile) {
        drawtextFilter += `:fontfile='${escapeFilterPath(fontFile)}'`
      } else if (fontFamily) {
        drawtextFilter += `:font='${escapeDrawtextText(fontFamily)}'`
      }
      if (backgroundColor) {
        drawtextFilter += `:box=1:boxcolor=${toFfmpegColor(backgroundColor)}@${alphaValue}`
      }
      if (borderWidth && borderWidth > 0) {
        drawtextFilter += `:borderw=${borderWidth}`
        if (borderColor) {
          drawtextFilter += `:bordercolor=${toFfmpegColor(borderColor)}`
        }
      }
      if (shadow) {
        drawtextFilter += ':shadowcolor=black@0.5:shadowx=2:shadowy=2'
      }
      if (start !== undefined && end !== undefined) {
        drawtextFilter += `:enable='between(t,${start},${end})'`
      }
      drawtextFilter += outputLabel
      filterParts.push(drawtextFilter)

      appLogger.info('FFmpegCommandBuilder text watermark font resolved', {
        index,
        fontFamily,
        fontFile,
        hasFontFile: !!fontFile
      })
    }

    if (!isLast) {
      currentLabel = `[v${index + 1}]`
    }
  })

  const filterComplex = filterParts.join(';')
  appLogger.info('FFmpegCommandBuilder final watermark filter graph', { filterComplex })
  return { imageInputs, filterComplex }
}
