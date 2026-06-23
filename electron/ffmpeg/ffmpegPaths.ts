import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

function getPlatformSubdir(): string {
  switch (process.platform) {
    case 'win32':
      return 'win'
    case 'darwin':
      return 'mac'
    default:
      return 'linux'
  }
}

function getFfmpegBaseDir(): string {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    return path.join(process.cwd(), 'public', 'ffmpeg')
  }

  return path.join(app.getAppPath(), 'dist', 'ffmpeg')
}

export function getFfmpegBinary(): string {
  const subdir = getPlatformSubdir()
  const filename = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const binaryPath = path.join(getFfmpegBaseDir(), subdir, filename)

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`FFmpeg 二进制不存在: ${binaryPath}`)
  }

  return binaryPath
}

export function getFfmpegOutputDir(): string {
  const outputDir = path.join(app.getPath('userData'), 'ffmpeg-output')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  return outputDir
}

export function createOutputPath(stepId: string, ext: string = 'mp4'): string {
  const safeId = stepId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const timestamp = Date.now()
  return path.join(getFfmpegOutputDir(), `${safeId}_${timestamp}.${ext}`)
}

function escapeConcatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

export function createConcatListPath(filePaths: string[]): string {
  const id = crypto
    .createHash('md5')
    .update(`${filePaths.join('|')}_${Date.now()}`)
    .digest('hex')
    .slice(0, 12)
  const listPath = path.join(getFfmpegOutputDir(), `concat_${id}.txt`)
  const content = filePaths.map(filePath => `file '${escapeConcatPath(filePath)}'`).join('\n')
  fs.writeFileSync(listPath, content, 'utf-8')
  return listPath
}

export function getFfmpegPreviewDir(): string {
  const previewDir = path.join(app.getPath('userData'), 'ffmpeg-preview')
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true })
  }
  return previewDir
}

export function createPreviewPath(inputPath: string, timeKey: string, ext: string = 'png'): string {
  const hash = crypto
    .createHash('md5')
    .update(`${inputPath}|${timeKey}`)
    .digest('hex')
    .slice(0, 12)
  return path.join(getFfmpegPreviewDir(), `preview_${hash}.${ext}`)
}
