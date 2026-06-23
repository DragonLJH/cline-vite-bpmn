import * as fs from "fs"
import * as path from "path"
import { buildWatermarkFilterGraph } from "./watermarkFilterGraph"

export type WatermarkType = 'image' | 'text'

export interface WatermarkTimeRange {
  start: string
  end: string
}

export interface BaseWatermarkPayload extends Partial<WatermarkTimeRange> {
  type: WatermarkType
  x?: number
  y?: number
  opacity?: number
}

export interface ImageWatermarkPayload extends BaseWatermarkPayload {
  type: 'image'
  image: string
  size?: number
}

export interface TextWatermarkPayload extends BaseWatermarkPayload {
  type: 'text'
  text: string
  fontSize?: number
  fontColor?: string
  fontFamily?: string
  backgroundColor?: string
  borderWidth?: number
  borderColor?: string
  shadow?: boolean
}

export type WatermarkPayload = ImageWatermarkPayload | TextWatermarkPayload

export interface AddWatermarksRequest {
  input: string
  output: string
  watermarks: WatermarkPayload[]
  duration?: number
}


// ========================
// 类型定义
// ========================

/** 输入项类型 */
type InputItem = {
  file: string
  options: string[]
}

/** ID3 标签元数据类型 */
type ID3Tags = {
  title?: string
  artist?: string
  album?: string
  genre?: string
  year?: string
}

/** 文字水印参数类型（用于 textWatermark 方法） */
export type TextWatermarkParams = {
  text: string
  x?: number
  y?: number
  fontSize?: number
  fontColor?: string
  fontFamily?: string
  start?: string
  end?: string
  opacity?: number
  backgroundColor?: string
  borderWidth?: number
  borderColor?: string
  shadow?: boolean
}

/** 图片水印项类型（用于 watermarks 方法） */
export type ImageWatermarkItem = ImageWatermarkPayload

/** 文字水印项类型（用于 watermarks 方法） */
export type TextWatermarkItem = TextWatermarkPayload

/** 水印项联合类型（用于 watermarks 方法） */
export type WatermarkItem = WatermarkPayload

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

// ========================
// FFmpeg 命令构建器类
// ========================

export class FFmpegCommandBuilder {

  private globalArgs: string[] = []
  private inputs: InputItem[] = []
  private filters: string[] = []
  private outputArgs: string[] = []
  private outputs: string[] = []

  // ========================
  // 全局
  // ========================
  overwrite() {
    this.globalArgs.push("-y")
    return this
  }

  global(...args: string[]) {
    this.globalArgs.push(...args)
    return this
  }

  // ========================
  // 输入
  // ========================
  input(file: string) {

    this.inputs.push({
      file,
      options: []
    })

    return this
  }

  private getLastInput() {

    if (this.inputs.length === 0) {
      throw new Error("请先调用 input()")
    }

    return this.inputs[this.inputs.length - 1]
  }

  // 快速 seek（-ss 在 input 前）
  seekInput(time: string) {

    const input = this.getLastInput()
    input.options.unshift("-ss", time)

    return this
  }

  // ========================
  // 输出阶段参数
  // ========================

  // 精确 seek（-ss 在 input 后）
  seekOutput(time: string) {
    this.outputArgs.push("-ss", time)
    return this
  }

  duration(time: string) {
    this.outputArgs.push("-t", time)
    return this
  }

  // ========================
  // 视频
  // ========================
  videoCodec(codec: string) {
    this.outputArgs.push("-vcodec", codec)
    return this
  }

  bitrate(rate: string) {
    this.outputArgs.push("-b:v", rate)
    return this
  }

  fps(fps: number) {
    this.outputArgs.push("-r", String(fps))
    return this
  }

  size(size: string) {
    this.outputArgs.push("-s", size)
    return this
  }

  // ========================
  // 音频
  // ========================
  audioCodec(codec: string) {
    this.outputArgs.push("-acodec", codec)
    return this
  }

  audioBitrate(rate: string) {
    this.outputArgs.push("-b:a", rate)
    return this
  }

  noAudio() {
    this.outputArgs.push("-an")
    return this
  }

  // ========================
  // 图片
  // ========================

  // 图片输入（可 loop）
  imageInput(file: string, loop = false) {

    const options: string[] = []

    if (loop) {
      options.push("-loop", "1")
    }

    this.inputs.push({ file, options })

    return this
  }

  // 水印（支持时间控制和大小调整）
  watermark(image: string, x = 10, y = 10, start?: string, end?: string, size?: number) {

    this.imageInput(image)

    // 如果有 size 参数，先用 scale 调整水印大小
    if (size !== undefined && size !== 100) {
      const scaleRatio = size / 100
      // 如果有时间参数，使用 enable 参数控制水印出现时间
      if (start !== undefined && end !== undefined) {
        this.filters.push(`[1:v]scale=iw*${scaleRatio}:ih*${scaleRatio}[wm];[0:v][wm]overlay=enable='between(t,${start},${end})':x=${x}:y=${y}`)
      } else {
        this.filters.push(`[1:v]scale=iw*${scaleRatio}:ih*${scaleRatio}[wm];[0:v][wm]overlay=${x}:${y}`)
      }
    } else {
      // 如果有时间参数，使用 enable 参数控制水印出现时间
      if (start !== undefined && end !== undefined) {
        this.filters.push(`overlay=enable='between(t,${start},${end})':x=${x}:y=${y}`)
      } else {
        this.filters.push(`overlay=${x}:${y}`)
      }
    }

    return this
  }

  // 文字水印（使用 drawtext 滤镜）
  textWatermark(params: TextWatermarkParams) {
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
      shadow = false
    } = params

    const fontFile = resolveFontFile(fontFamily)

    // 构建 drawtext 滤镜字符串
    let drawtextFilter = `drawtext=text='${escapeDrawtextText(text)}'`

    // 位置和大小
    drawtextFilter += `:x=${x}:y=${y}:fontsize=${fontSize}`

    // 处理颜色，支持十六进制和颜色名称
    let colorValue = fontColor
    if (fontColor.startsWith('#')) {
      // 将 #RRGGBB 转换为 0xRRGGBB 格式
      colorValue = `0x${fontColor.slice(1)}`
    }

    // 透明度处理 (FFmpeg 使用 0.0-1.0 或 @alpha 后缀)
    const alphaValue = opacity / 100
    drawtextFilter += `:fontcolor=${colorValue}@${alphaValue}`

    // 字体：Windows 上优先使用 fontfile，避免 drawtext 找不到中文字体。
    if (fontFile) {
      drawtextFilter += `:fontfile='${escapeFilterPath(fontFile)}'`
    } else if (fontFamily) {
      drawtextFilter += `:font='${escapeDrawtextText(fontFamily)}'`
    }

    // 背景框
    if (backgroundColor) {
      let bgColor = backgroundColor
      if (backgroundColor.startsWith('#')) {
        bgColor = `0x${backgroundColor.slice(1)}`
      }
      drawtextFilter += `:box=1:boxcolor=${bgColor}@${alphaValue}`
    }

    // 边框
    if (borderWidth && borderWidth > 0) {
      drawtextFilter += `:borderw=${borderWidth}`
      if (borderColor) {
        let bdColor = borderColor
        if (borderColor.startsWith('#')) {
          bdColor = `0x${borderColor.slice(1)}`
        }
        drawtextFilter += `:bordercolor=${bdColor}`
      }
    }

    // 阴影
    if (shadow) {
      drawtextFilter += `:shadowcolor=black@0.5:shadowx=2:shadowy=2`
    }

    // 时间控制
    if (start !== undefined && end !== undefined) {
      drawtextFilter += `:enable='between(t,${start},${end})'`
    }

    this.filters.push(drawtextFilter)

    return this
  }

  // 多水印支持（一次性处理所有水印，使用 filter_complex，支持图片和文字混合）
  watermarks(watermarks: WatermarkItem[]) {
    if (watermarks.length === 0) {
      console.warn('[FFmpegCommandBuilder] watermarks called with empty array')
      return this
    }

    const { imageInputs, filterComplex } = buildWatermarkFilterGraph(watermarks)
    imageInputs.forEach(image => this.imageInput(image))
    this.filters.push(filterComplex)

    return this
  }

  // 封面（ID3）
  attachCover(image: string) {

    this.imageInput(image)

    this.outputArgs.push("-map", "0")
    this.outputArgs.push("-map", "1")
    this.outputArgs.push("-c", "copy")
    this.outputArgs.push("-disposition:v:0", "attached_pic")

    return this
  }

  // ========================
  // metadata
  // ========================
  metadata(key: string, value: string) {
    this.outputArgs.push("-metadata", `${key}=${value}`)
    return this
  }

  id3(tags: ID3Tags) {

    if (tags.title) this.metadata("title", tags.title)
    if (tags.artist) this.metadata("artist", tags.artist)
    if (tags.album) this.metadata("album", tags.album)
    if (tags.genre) this.metadata("genre", tags.genre)
    if (tags.year) this.metadata("date", tags.year)

    return this
  }

  // ========================
  // 性能控制
  // ========================

  /**
   * 限制线程数
   * @param count 线程数量（默认：CPU核心数/2）
   */
  threads(count?: number) {
    const threadCount = count ?? Math.max(1, Math.floor(require('os').cpus().length / 2))
    this.outputArgs.push("-threads", String(threadCount))
    return this
  }

  /**
   * 设置编码预设
   * @param preset 预设名称（ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow）
   */
  preset(preset: string) {
    this.outputArgs.push("-preset", preset)
    return this
  }

  /**
   * 添加性能优化参数
   */
  performanceOptions() {
    this.outputArgs.push(
      "-max_muxing_queue_size", "1024",  // 限制复用队列大小，防止内存溢出
      "-avioflags", "direct",            // 直接I/O，减少缓存
      "-fflags", "+fastseek"             // 启用快速seek
    )
    return this
  }

  /**
   * 设置优先级（仅Windows有效）
   * @param priority 优先级：low, normal, high
   */
  priority(priority: 'low' | 'normal' | 'high') {
    // 注意：这个参数需要在executor中特殊处理
    // 这里只是标记，实际执行时会由executor处理
    this.globalArgs.push(`-priority:${priority}`)
    return this
  }

  // ========================
  // 扩展
  // ========================
  custom(...args: string[]) {
    this.outputArgs.push(...args)
    return this
  }

  // ========================
  // 输出
  // ========================
  output(file: string) {
    this.outputs.push(file)
    return this
  }


  // ========================
  // build
  // ========================

  build(): string[] {

    const args: string[] = []

    // global
    args.push(...this.globalArgs)

    // inputs
    this.inputs.forEach(input => {
      args.push(...input.options)
      args.push("-i", input.file)
    })

    // filter
    if (this.filters.length > 0) {
      const needsFilterComplex = this.inputs.length > 1
        || this.filters.some(filter => filter.includes(';') || filter.includes('['))

      if (needsFilterComplex) {
        args.push('-filter_complex', this.filters.join(';'))
      } else {
        args.push('-vf', this.filters.join(','))
      }
    }

    // output args
    args.push(...this.outputArgs)

    // outputs
    this.outputs.forEach(output => {
      args.push(output)
    })
    return args
  }

}
