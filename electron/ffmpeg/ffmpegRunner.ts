import { ffmpegExecutor } from './executorInstance'
import type { ExecutorOptions, FFmpegTask } from './FFmpegExecutor'
import { FFmpegCommandBuilder } from './FFmpegCommandBuilder'
import type { FFmpegProgress } from './progressParser'
import { videoService, type TranscodeParams, type MediaInfo as DetailedMediaInfo } from '../services/videoService'
import { toFlatMediaInfo, parseFlatMediaInfo } from '../services/mediaInfoAdapter'
import type { FlatMediaInfo } from '../services/types'

export type MediaInfo = FlatMediaInfo

export { videoService }
export type { TranscodeParams, MediaInfo as VideoMediaInfo, StreamInfo } from '../services/videoService'
export type { FlatMediaInfo } from '../services/types'
export { toFlatMediaInfo } from '../services/mediaInfoAdapter'

export interface FfmpegRunOptions {
  taskId?: string
  duration?: number
  timeout?: number
  onProgress?: (data: { taskId?: string; progress: FFmpegProgress }) => void
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
    onProgress: options.onProgress
      ? (progress) => options.onProgress!({ taskId: options.taskId, progress })
      : undefined
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

export async function probeMedia(inputPath: string): Promise<FfmpegProbeResult> {
  try {
    const builder = new FFmpegCommandBuilder()
      .input(inputPath)
      .custom('-hide_banner', '-f', 'null', '-', '-analyzeduration', '5000000', '-probesize', '5000000')

    const args = builder.build()
    const result = await runFfmpeg(args, { timeout: 15000 })
    const detailedInfo = videoService.parseMediaInfo(result.stderr)

    return {
      success: result.success,
      info: toFlatMediaInfo(detailedInfo, result.stderr),
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

export async function transcodeVideo(
  params: TranscodeParams,
  options?: FfmpegRunOptions
): Promise<FfmpegServiceResult> {
  const task = videoService.transcode(
    params,
    options?.onProgress
      ? (progress) => options.onProgress!({ taskId: options.taskId, progress })
      : undefined
  )
  const result = await awaitTask(task)
  return { ...result, outputPath: params.output }
}

export async function cutVideo(
  input: string,
  output: string,
  start: string,
  duration: string,
  precise = false,
  options?: FfmpegRunOptions
): Promise<FfmpegServiceResult> {
  const task = videoService.cut(input, output, start, duration, precise)
  const result = await awaitTask(task)
  return { ...result, outputPath: output }
}

export async function screenshotVideo(
  input: string,
  time: string,
  output: string,
  accurate = false
): Promise<FfmpegServiceResult> {
  const task = accurate
    ? videoService.screenshotAccurate(input, time, output)
    : videoService.screenshot(input, time, output)
  const result = await awaitTask(task)
  return { ...result, outputPath: output }
}

export async function addWatermarksVideo(
  params: Parameters<typeof videoService.addWatermarks>[0],
  options?: FfmpegRunOptions
): Promise<FfmpegServiceResult> {
  const task = videoService.addWatermarks(
    params,
    options?.onProgress
      ? (progress) => options.onProgress!({ taskId: options.taskId, progress })
      : undefined
  )
  const result = await awaitTask(task)
  return { ...result, outputPath: params.output }
}
