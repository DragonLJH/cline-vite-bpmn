import { videoService } from "../services/videoService"
import { FFmpegProgress } from "../ffmpeg/progressParser"
import type { FFmpegResult, FFmpegTask } from "../ffmpeg/FFmpegExecutor"
import { probeMedia, runFfmpegTask, type FfmpegProbeResult, type MediaInfo } from "./ffmpegRunner"
import { buildJobCommand, formatFfmpegCommandPreview } from "./jobCommandBuilder"
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

export interface RunWithArgsOptions {
  duration?: number
  timeout?: number
  maxThreads?: number
  priority?: 'low' | 'normal' | 'high'
  memoryLimit?: string
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
  async probe(
    inputPath: string,
    options?: { onPartial?: (info: MediaInfo) => void }
  ): Promise<FfmpegProbeResult> {
    return probeMedia(inputPath, options)
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
      timeout: options?.timeout,
      maxThreads: options?.maxThreads,
      priority: options?.priority,
      memoryLimit: options?.memoryLimit,
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

  async runRaw(
    args: string[],
    taskId: string,
    options?: RunWithArgsOptions
  ): Promise<FFmpegResult & { taskId: string }> {
    return this.runWithArgs(args, taskId, options)
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
    console.log(`[ffmpegManager.executeJob][${taskId}] ${formatFfmpegCommandPreview(args)}`)

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

  previewJobCommand(
    config: FfmpegJobConfig,
    inputPath?: string,
    outputPath?: string,
    resolvedImages: string[] = []
  ): { command: string; args: string[] } {
    const resolvedInput = inputPath || '/path/to/input.mp4'
    const resolvedOutput = outputPath || '/path/to/output.mp4'
    const output = config.action === 'probe' ? undefined : resolvedOutput
    const args = buildJobCommand(config, resolvedInput, output, resolvedImages)
    return {
      command: `ffmpeg ${formatFfmpegCommandPreview(args)}`,
      args
    }
  }
}

export const ffmpegManager = new FfmpegManager()
