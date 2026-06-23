import type { MediaInfo } from '../../types/bpmn'

import type { FfmpegJobConfig, WorkflowGraph } from '../../types/bpmn'

import { resolveWorkflowGraphForRun, type WorkflowRunContext } from './workflowGraphResolver'

import {

  getJobOutputFormat,

  getJobOutputVar,

  parseTrimDuration,

  resolveFilterImage,

  resolveJobInput,

  DEFAULT_FFMPEG_JOB_CONFIG

} from './jobConfig'

import { previewJobCommand } from './jobCommandBuilder'



export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'



export interface WorkflowStepResult {

  stepId: string

  name?: string

  status: StepStatus

  operation: FfmpegJobConfig['action']

  inputPath?: string

  outputPath?: string

  command?: string

  exitCode?: number | null

  mediaInfo?: MediaInfo

  progressPercent?: number

  stdout?: string

  stderr?: string

  error?: string

}



export interface WorkflowRunResult {

  success: boolean

  steps: WorkflowStepResult[]

  context: Record<string, unknown>

  error?: string

}



function getElectronFfmpeg() {

  if (!window.electronAPI?.ffmpeg) {

    throw new Error('FFmpeg API 不可用，请在 Electron 环境中运行')

  }

  return window.electronAPI.ffmpeg

}



function getDurationFromContext(context: Record<string, unknown>): number | undefined {

  for (const value of Object.values(context)) {

    if (value && typeof value === 'object' && 'durationSeconds' in value) {

      const seconds = (value as MediaInfo).durationSeconds

      if (typeof seconds === 'number' && seconds > 0) {

        return seconds

      }

    }

  }

  return undefined

}



function logStepCommand(stepId: string, command: string) {

  console.log(`[FFmpeg Workflow][${stepId}] 执行命令:\n  ${command}`)

}



function logStepResult(

  stepId: string,

  result: { success: boolean; code?: number | null; stdout?: string; stderr?: string; error?: string }

) {

  console.log(`[FFmpeg Workflow][${stepId}] 执行结果:`, {

    success: result.success,

    exitCode: result.code ?? null,

    error: result.error,

    stdout: result.stdout?.trim() || undefined,

    stderr: result.stderr?.trim()?.slice(-800) || undefined

  })

}



function resolveOverlayImages(config: FfmpegJobConfig, context: Record<string, unknown>): string[] {

  return (config.filters || [])

    .filter((filter): filter is Extract<typeof filter, { type: 'overlay' }> => filter.type === 'overlay')

    .map(filter => resolveFilterImage(filter.image, context))

}

async function getCommandPreview(
  ffmpeg: NonNullable<Window['electronAPI']>['ffmpeg'],
  config: FfmpegJobConfig,
  inputPath: string,
  outputPath?: string,
  overlayImages: string[] = []
): Promise<string> {
  if (ffmpeg.previewJobCommand) {
    const result = await ffmpeg.previewJobCommand({ config, inputPath, outputPath, overlayImages })
    if (result.success && result.command) return result.command
  }

  return previewJobCommand(config, inputPath, outputPath)
}



export async function runWorkflow(

  bpmnXml: string,

  inputFilePath: string,

  onStepUpdate?: (step: WorkflowStepResult) => void,

  runContext?: WorkflowRunContext

): Promise<WorkflowRunResult> {

  const graph = resolveWorkflowGraphForRun(bpmnXml, runContext)

  if (!graph) {

    return { success: false, steps: [], context: {}, error: '无法解析工作流' }

  }



  if (graph.executionOrder.length === 0) {

    return { success: false, steps: [], context: {}, error: '工作流中没有 ServiceTask 节点' }

  }



  const ffmpeg = getElectronFfmpeg()

  const context: Record<string, unknown> = { input: inputFilePath }

  const steps: WorkflowStepResult[] = []

  let prevOutput: string | undefined



  const taskMap = new Map(graph.tasks.map(task => [task.id, task]))



  for (const stepId of graph.executionOrder) {

    const task = taskMap.get(stepId)

    if (!task) continue



    const config: FfmpegJobConfig = task.ffmpegConfig || {

      ...DEFAULT_FFMPEG_JOB_CONFIG,

      output: { ...DEFAULT_FFMPEG_JOB_CONFIG.output, var: `${stepId}.output` }

    }



    const stepResult: WorkflowStepResult = {

      stepId,

      name: task.name,

      status: 'running',

      operation: config.action

    }



    onStepUpdate?.(stepResult)



    try {

      const inputPath = resolveJobInput(config, context, { inputFilePath, prevOutput })

      stepResult.inputPath = inputPath



      if (config.action === 'probe') {

        stepResult.command = await getCommandPreview(ffmpeg, config, inputPath)

        logStepCommand(stepId, stepResult.command)

        onStepUpdate?.({ ...stepResult })



        const probeResult = await ffmpeg.probe({ inputPath })



        logStepResult(stepId, {

          success: probeResult.success,

          stderr: probeResult.info?.raw,

          error: probeResult.error

        })



        if (!probeResult.success || !probeResult.info) {

          stepResult.status = 'failed'

          stepResult.error = probeResult.error || '探测失败'

          stepResult.stderr = probeResult.info?.raw

          steps.push(stepResult)

          onStepUpdate?.(stepResult)

          return { success: false, steps, context, error: stepResult.error }

        }



        stepResult.status = 'success'

        stepResult.mediaInfo = probeResult.info

        stepResult.stderr = probeResult.info.raw



        const outputKey = getJobOutputVar(config, stepId)

        context[outputKey] = probeResult.info

        context[`${stepId}.info`] = probeResult.info

      } else {

        const outputKey = getJobOutputVar(config, stepId)

        const ext = getJobOutputFormat(config)

        const outputPathResult = await ffmpeg.createOutputPath({ stepId, ext })



        if (!outputPathResult.success || !outputPathResult.path) {

          throw new Error(outputPathResult.error || '无法创建输出路径')

        }



        const outputPath = outputPathResult.path

        const overlayImages = resolveOverlayImages(config, context)

        stepResult.command = await getCommandPreview(ffmpeg, config, inputPath, outputPath, overlayImages)

        logStepCommand(stepId, stepResult.command)

        onStepUpdate?.({ ...stepResult })



        const taskId = stepId

        const duration =

          config.action === 'trim'

            ? parseTrimDuration(config)

            : getDurationFromContext(context)



        const unsubscribe = ffmpeg.onProgress?.((data) => {

          if (data.taskId !== taskId) return

          const percent = data.progress.percent

          if (percent == null) return

          stepResult.progressPercent = Math.round(percent)

          onStepUpdate?.({ ...stepResult })

        })



        let runResult

        try {

          runResult = await ffmpeg.runJob({
            config,
            inputPath,
            outputPath,
            taskId,
            duration,
            overlayImages
          })

        } finally {

          unsubscribe?.()

        }



        stepResult.outputPath = outputPath

        stepResult.stdout = runResult.stdout

        stepResult.stderr = runResult.stderr

        stepResult.exitCode = runResult.code

        stepResult.progressPercent = runResult.success ? 100 : stepResult.progressPercent



        logStepResult(stepId, {

          success: runResult.success,

          code: runResult.code,

          stdout: runResult.stdout,

          stderr: runResult.stderr,

          error: runResult.errorReason

        })



        if (!runResult.success) {

          stepResult.status = 'failed'

          stepResult.error = runResult.errorReason || runResult.stderr || `FFmpeg 退出码: ${runResult.code}`

          steps.push(stepResult)

          onStepUpdate?.(stepResult)

          return { success: false, steps, context, error: stepResult.error }

        }



        stepResult.status = 'success'

        context[outputKey] = outputPath

        context[`${stepId}.output`] = outputPath

        prevOutput = outputPath

      }



      steps.push(stepResult)

      onStepUpdate?.({ ...stepResult })

    } catch (error) {

      stepResult.status = 'failed'

      stepResult.error = (error as Error).message

      steps.push(stepResult)

      onStepUpdate?.(stepResult)

      return { success: false, steps, context, error: stepResult.error }

    }

  }



  return { success: true, steps, context }

}



export function getWorkflowSummary(graph: WorkflowGraph | null): string {

  if (!graph) return '无工作流'

  return `${graph.tasks.length} 个步骤，执行顺序: ${graph.executionOrder.join(' → ')}`

}


