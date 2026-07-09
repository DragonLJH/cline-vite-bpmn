import { ffmpegExecutor } from './executorInstance'
import type { ExecutorOptions, FFmpegTask } from './FFmpegExecutor'
import type { FFmpegProgress } from './progressParser'
import { buildJobCommand } from './jobCommandBuilder'
import { videoService, type MediaInfo as DetailedMediaInfo } from '../services/videoService'
import { toFlatMediaInfo, parseFlatMediaInfo } from '../services/mediaInfoAdapter'
import type { FlatMediaInfo } from '../services/types'
import type { FfmpegJobConfig } from './jobConfig'

export type MediaInfo = FlatMediaInfo

export type { MediaInfo as VideoMediaInfo, StreamInfo } from '../services/videoService'
export type { FlatMediaInfo } from '../services/types'
export { toFlatMediaInfo } from '../services/mediaInfoAdapter'

export interface FfmpegRunOptions {
  taskId?: string
  duration?: number
  timeout?: number
  maxThreads?: number
  priority?: 'low' | 'normal' | 'high'
  memoryLimit?: string
  onProgress?: (data: { taskId?: string; progress: FFmpegProgress }) => void
  onLog?: (line: string) => void
}

export interface ProbeMediaOptions {
  onPartial?: (info: MediaInfo) => void
}

export interface FfmpegRunResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  errorReason?: string
}

export interface FfmpegProbeResult {
  success: boolean
  info?: MediaInfo
  detailedInfo?: DetailedMediaInfo
  error?: string
  code?: number | null
}

export interface FfmpegServiceResult extends FfmpegRunResult {
  outputPath?: string
}

function toExecutorOptions(options?: FfmpegRunOptions): ExecutorOptions {
  if (!options) return {}

  return {
    duration: options.duration,
    timeout: options.timeout,
    maxThreads: options.maxThreads,
    priority: options.priority,
    memoryLimit: options.memoryLimit,
    onProgress: options.onProgress
      ? (progress) => options.onProgress!({ taskId: options.taskId, progress })
      : undefined,
    onLog: options.onLog
  }
}

function toRunResult(result: Awaited<FFmpegTask['result']>): FfmpegRunResult {
  return {
    success: result.success,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    errorReason: result.errorReason
  }
}

async function awaitTask(task: FFmpegTask): Promise<FfmpegRunResult> {
  try {
    return toRunResult(await task.result)
  } catch (error) {
    return {
      success: false,
      code: null,
      stdout: '',
      stderr: (error as Error).message,
      errorReason: (error as Error).message
    }
  }
}

/** @deprecated 使用 videoService.parseMediaInfo + toFlatMediaInfo */
export function parseMediaInfo(stderr: string): MediaInfo {
  return parseFlatMediaInfo(stderr)
}

export async function runFfmpeg(args: string[], options?: FfmpegRunOptions): Promise<FfmpegRunResult> {
  const task = ffmpegExecutor.run(args, toExecutorOptions(options))
  return awaitTask(task)
}

export function runFfmpegTask(args: string[], options?: FfmpegRunOptions): FFmpegTask {
  return ffmpegExecutor.run(args, toExecutorOptions(options))
}

export async function probeMedia(
  inputPath: string,
  options?: ProbeMediaOptions
): Promise<FfmpegProbeResult> {
  try {
    const config: FfmpegJobConfig = {
      type: 'ffmpeg',
      action: 'probe',
      global: { hideBanner: true, noStdin: true }
    }
    const args = buildJobCommand(config, inputPath)
    let accumulated = ''

    const emitPartial = () => {
      if (!accumulated.trim() || !options?.onPartial) return
      options.onPartial({
        ...parseFlatMediaInfo(accumulated),
        raw: accumulated
      })
    }

    const result = await runFfmpeg(args, {
      timeout: 15000,
      onLog: (line) => {
        accumulated += line
        emitPartial()
      }
    })

    const stderr = result.stderr || accumulated
    const detailedInfo = videoService.parseMediaInfo(stderr)

    return {
      success: result.success,
      info: toFlatMediaInfo(detailedInfo, stderr),
      detailedInfo,
      code: result.code
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      code: null
    }
  }
}

export async function getDetailedMediaInfo(inputPath: string) {
  try {
    const info = await videoService.getMediaInfo(inputPath)
    return { success: true as const, info }
  } catch (error) {
    return { success: false as const, error: (error as Error).message }
  }
}
