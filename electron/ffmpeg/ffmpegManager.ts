import { videoService, TranscodeParams, MediaInfo } from "../services/videoService"
import { FFmpegProgress } from "../ffmpeg/progressParser"
import { WatermarkItem } from "../ffmpeg/FFmpegCommandBuilder"
import type { FFmpegResult, FFmpegTask } from "../ffmpeg/FFmpegExecutor"
import { probeMedia, runFfmpegTask, type FfmpegProbeResult } from "./ffmpegRunner"
import { buildJobCommand } from "./jobCommandBuilder"
import type { FfmpegJobConfig } from "./jobConfig"
import { getJobOutputFormat, parseTrimDuration } from "./jobConfig"

// 统一返回类型
interface TaskResult {
  taskId: string
  success: boolean
  error?: string
}

function normalizeTaskResult(taskId: string, result: FFmpegResult, outputPath?: string): TaskResult & { outputPath?: string } {
  if (!result.success) {
    return {
      taskId,
      success: false,
      error: result.errorReason || `FFmpeg 处理失败，退出码：${result.code ?? 'unknown'}`
    }
  }

  return {
    taskId,
    success: true,
    outputPath
  }
}

function normalizeTaskError(taskId: string, error: unknown): TaskResult {
  return {
    taskId,
    success: false,
    error: error instanceof Error ? error.message : '未知错误'
  }
}

// 性能配置接口
export interface PerformanceConfig {
  maxThreads?: number     // 最大线程数
  preset?: string         // 编码预设
  priority?: 'low' | 'normal' | 'high'  // 进程优先级
  memoryLimit?: string    // 内存限制
}

export interface RunWithArgsOptions {
  duration?: number
  onProgress?: (data: { taskId: string; progress: FFmpegProgress }) => void
}

class FfmpegManager {
  private activeTasks = new Map<string, FFmpegTask>()

  private async awaitTrackedTask(taskId: string, task: FFmpegTask): Promise<FFmpegResult> {
    this.activeTasks.set(taskId, task)
    try {
      return await task.result
    } finally {
      this.activeTasks.delete(taskId)
    }
  }

  /**
   * 探测媒体信息（BPMN 工作流 probe 步骤）
   */
  async probe(inputPath: string): Promise<FfmpegProbeResult> {
    return probeMedia(inputPath)
  }

  /**
   * 执行原始 FFmpeg 参数（BPMN 工作流各步骤命令执行）
   */
  async runWithArgs(
    args: string[],
    taskId: string,
    options?: RunWithArgsOptions
  ): Promise<FFmpegResult & { taskId: string }> {
    const task = runFfmpegTask(args, {
      taskId,
      duration: options?.duration,
      onProgress: options?.onProgress
        ? (data) => options.onProgress!({
            taskId: data.taskId || taskId,
            progress: data.progress
          })
        : undefined
    })

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return { ...result, taskId }
    } catch (error) {
      return {
        success: false,
        code: null,
        signal: null,
        stdout: '',
        stderr: (error as Error).message,
        errorReason: (error as Error).message,
        taskId
      }
    }
  }

  /**
   * 取消正在运行的任务
   */
  cancel(taskId: string): { success: boolean; error?: string } {
    const task = this.activeTasks.get(taskId)
    if (!task) {
      return { success: false, error: '任务不存在或已结束' }
    }
    task.cancel()
    this.activeTasks.delete(taskId)
    return { success: true }
  }

  /**
   * 转码（完整能力）
   * @param params 转码参数
   * @param pCallback 进度回调
   * @param performanceConfig 性能配置（可选）
   */
  async run(
    params: TranscodeParams,
    pCallback?: (res: { taskId: string; progress: FFmpegProgress }) => void,
    performanceConfig?: PerformanceConfig
  ): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`

    // 如果提供了性能配置，将其合并到params中
    const finalParams = performanceConfig 
      ? { ...params, performance: performanceConfig }
      : params

    const task = videoService.transcode(finalParams, (progress) => {
      pCallback?.({ taskId, progress })
    })

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 截图（快速模式）
   * @param input 输入文件路径
   * @param time 截图时间点（如 "00:00:01"）
   * @param output 输出文件路径
   */
  async screenshot(input: string, time: string, output: string): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`

    const task = videoService.screenshot(input, time, output)

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 精确截图
   * @param input 输入文件路径
   * @param time 截图时间点（如 "00:00:01"）
   * @param output 输出文件路径
   */
  async screenshotAccurate(input: string, time: string, output: string): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`

    const task = videoService.screenshotAccurate(input, time, output)

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 裁剪视频
   * @param input 输入文件路径
   * @param output 输出文件路径
   * @param start 开始时间
   * @param duration 持续时长
   * @param precise 是否使用精确模式（默认 false）
   */
  async cut(
    input: string,
    output: string,
    start: string,
    duration: string,
    precise: boolean = false
  ): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`

    const task = videoService.cut(input, output, start, duration, precise)

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 添加视频水印
   * @param input 输入文件路径
   * @param output 输出文件路径
   * @param watermarkImage 水印图片路径
   * @param x 水印 X 坐标（默认 10）
   * @param y 水印 Y 坐标（默认 10）
   * @param startTime 水印开始时间（秒）
   * @param endTime 水印结束时间（秒）
   * @param size 水印大小（百分比，1-100）
   * @param pCallback 进度回调
   */
  async addWatermark(
    input: string,
    output: string,
    watermarkImage: string,
    x: number = 10,
    y: number = 10,
    startTime?: string,
    endTime?: string,
    size?: number,
    pCallback?: (res: { taskId: string; progress: FFmpegProgress }) => void
  ): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`

    const task = videoService.transcode({
      input,
      output,
      watermark: {
        image: watermarkImage,
        x,
        y,
        start: startTime,
        end: endTime,
        size
      }
    }, (progress) => {
      pCallback?.({ taskId, progress })
    })

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 添加多个视频水印（一次性处理，支持图片和文字混合）
   * @param input 输入文件路径
   * @param output 输出文件路径
   * @param watermarks 水印数组（支持图片和文字类型）
   * @param pCallback 进度回调
   */
  async addWatermarks(
    input: string,
    output: string,
    watermarks: WatermarkItem[],
    duration?: number,
    pCallback?: (res: { taskId: string; progress: FFmpegProgress }) => void
  ): Promise<TaskResult & { outputPath?: string }> {
    const taskId = `task_${Date.now()}`

    const task = videoService.addWatermarks({
      input,
      output,
      watermarks,
      duration
    }, (progress) => {
      pCallback?.({ taskId, progress })
    })

    try {
      const result = await this.awaitTrackedTask(taskId, task)
      return normalizeTaskResult(taskId, result, output)
    } catch (err) {
      return normalizeTaskError(taskId, err)
    }
  }

  /**
   * 获取媒体信息
   * @param input 输入文件路径
   * @returns 媒体信息
   */
  async getMediaInfo(input: string): Promise<MediaInfo> {
    return await videoService.getMediaInfo(input)
  }

  /**
   * 按统一 JSON 配置执行工作流步骤
   */
  async executeJob(
    config: FfmpegJobConfig,
    inputPath: string,
    outputPath: string | undefined,
    taskId: string,
    options?: RunWithArgsOptions & { resolvedImages?: string[] }
  ): Promise<FFmpegResult & { taskId: string; outputPath?: string }> {
    if (config.action === 'probe') {
      const probeResult = await this.probe(inputPath)
      return {
        success: probeResult.success,
        code: probeResult.code ?? (probeResult.success ? 0 : 1),
        signal: null,
        stdout: '',
        stderr: probeResult.info?.raw || probeResult.error || '',
        errorReason: probeResult.error,
        taskId
      }
    }

    if (!outputPath) {
      return {
        success: false,
        code: null,
        signal: null,
        stdout: '',
        stderr: '缺少输出路径',
        errorReason: '缺少输出路径',
        taskId
      }
    }

    const args = buildJobCommand(
      config,
      inputPath,
      outputPath,
      options?.resolvedImages || []
    )
    console.log(`[ffmpegManager.executeJob][${taskId}] ${args.map(arg => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')}`)

    const duration = config.action === 'trim'
      ? parseTrimDuration(config)
      : options?.duration

    const result = await this.runWithArgs(args, taskId, {
      duration,
      onProgress: options?.onProgress
    })

    return {
      ...result,
      outputPath: result.success ? outputPath : undefined
    }
  }

  getOutputFormat(config: FfmpegJobConfig): string {
    return getJobOutputFormat(config)
  }
}

export const ffmpegManager = new FfmpegManager()
