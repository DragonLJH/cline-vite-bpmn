import type { MediaInfo, FfmpegJobConfig, WorkflowGraph } from '../../types/bpmn'
import { resolveWorkflowGraphForRun, type WorkflowRunContext } from './workflowGraphResolver'
import { applyProbeMigrationToBpmnXml } from './probeNodeMigration'
import {
  getJobOutputFormat,
  getJobOutputVar,
  parseTrimDuration,
  resolveFilterImage,
  resolveJobInput,
  DEFAULT_FFMPEG_JOB_CONFIG
} from './jobConfig'
import { previewJobCommand } from './jobCommandBuilder'
import type { BuildJobCommandOptions } from '../../shared/ffmpeg/jobCommandBuilder'
import {
  collectEntryInputTasks,
  collectUpstreamServiceTasks,
  resolveBranchOutputPaths,
  resolveImmediateUpstreamOutput,
  validateCopyMergeCompatibility
} from '../../shared/ffmpeg/mergeInputs'

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

export interface WorkflowEntryPayload {
  path: string
  mediaInfo?: MediaInfo
}

export type WorkflowEntryInputsArg =
  | string
  | WorkflowEntryPayload
  | Record<string, WorkflowEntryPayload>

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

function normalizeEntryPayload(value: string | WorkflowEntryPayload): WorkflowEntryPayload {
  if (typeof value === 'string') return { path: value }
  return value
}

function injectEntryIntoContext(
  context: Record<string, unknown>,
  taskId: string,
  payload: WorkflowEntryPayload
) {
  context[`${taskId}.input`] = payload.path
  if (payload.mediaInfo) {
    context[`${taskId}.info`] = payload.mediaInfo
  }
}

function initializeWorkflowContext(
  graph: WorkflowGraph,
  entryInputs: WorkflowEntryInputsArg
): Record<string, unknown> {
  const entryTasks = collectEntryInputTasks(graph)
  const context: Record<string, unknown> = {}

  if (typeof entryInputs === 'string') {
    context.input = entryInputs
    if (entryTasks.length === 1) {
      context[`${entryTasks[0].id}.input`] = entryInputs
    }
    return context
  }

  if ('path' in entryInputs) {
    const payload = normalizeEntryPayload(entryInputs)
    if (entryTasks.length === 1) {
      injectEntryIntoContext(context, entryTasks[0].id, payload)
      context.input = payload.path
    }
    return context
  }

  entryTasks.forEach(task => {
    const raw = entryInputs[task.id]
    if (!raw?.path) {
      throw new Error(`入口 ${task.name || task.id} 缺少输入文件`)
    }
    injectEntryIntoContext(context, task.id, normalizeEntryPayload(raw))
  })

  if (entryTasks.length === 1) {
    const payload = normalizeEntryPayload(entryInputs[entryTasks[0].id])
    context.input = payload.path
    if (payload.mediaInfo) {
      context[`${entryTasks[0].id}.info`] = payload.mediaInfo
    }
  }

  return context
}

function assertJoinBarrierReady(graph: WorkflowGraph, stepId: string, context: Record<string, unknown>) {
  const reverseAdjacency = graph.reverseAdjacency
  if (!reverseAdjacency) return

  const directPreds = reverseAdjacency.get(stepId) || []
  directPreds.forEach(predId => {
    if (!graph.joinGateways.includes(predId)) return
    const barrierTasks = graph.joinBarrierTasks.get(predId) || []
    barrierTasks.forEach(taskId => {
      const output = context[`${taskId}.output`]
      if (typeof output !== 'string' || !output) {
        throw new Error(`Join 屏障未满足：分支 ${taskId} 尚未完成`)
      }
    })
  })
}

async function recordStepOutputContext(
  ffmpeg: NonNullable<Window['electronAPI']>['ffmpeg'],
  stepId: string,
  outputPath: string,
  outputKey: string,
  context: Record<string, unknown>
): Promise<MediaInfo | undefined> {
  context[outputKey] = outputPath
  context[`${stepId}.output`] = outputPath

  try {
    const probeResult = await ffmpeg.probe({ inputPath: outputPath, taskId: stepId })
    if (probeResult.success && probeResult.info) {
      context[`${stepId}.info`] = probeResult.info
      return probeResult.info
    }
  } catch {
    // 输出探测失败不阻断非合并步骤
  }

  return undefined
}

function getSegmentHasAudio(taskIds: string[], context: Record<string, unknown>): boolean[] {
  return taskIds.map(taskId => {
    const info = context[`${taskId}.info`] as MediaInfo | undefined
    return Boolean(info?.audioCodec)
  })
}

function getSegmentDurations(taskIds: string[], context: Record<string, unknown>): number[] {
  return taskIds.map(taskId => {
    const info = context[`${taskId}.info`] as MediaInfo | undefined
    if (info?.durationSeconds && info.durationSeconds > 0) return info.durationSeconds
    throw new Error(`交叉淡化合并需要分支 ${taskId} 的输出时长信息，请确认该分支已成功执行`)
  })
}

async function getCommandPreview(
  ffmpeg: NonNullable<Window['electronAPI']>['ffmpeg'],
  config: FfmpegJobConfig,
  inputPath: string,
  outputPath?: string,
  overlayImages: string[] = [],
  commandOptions?: BuildJobCommandOptions
): Promise<string> {
  if (ffmpeg.previewJobCommand) {
    const result = await ffmpeg.previewJobCommand({
      config,
      inputPath,
      outputPath,
      overlayImages,
      inputPaths: commandOptions?.inputPaths,
      segmentDurations: commandOptions?.segmentDurations,
      segmentHasAudio: commandOptions?.segmentHasAudio,
      targetSize: commandOptions?.targetSize
    })
    if (result.success && result.command) return result.command
  }

  return previewJobCommand(config, inputPath, outputPath, overlayImages, commandOptions)
}

export async function runWorkflow(
  bpmnXml: string,
  entryInputs: WorkflowEntryInputsArg,
  onStepUpdate?: (step: WorkflowStepResult) => void,
  runContext?: WorkflowRunContext
): Promise<WorkflowRunResult> {
  const migratedXml = applyProbeMigrationToBpmnXml(bpmnXml)
  const graph = resolveWorkflowGraphForRun(migratedXml, runContext)
  if (!graph) {
    return { success: false, steps: [], context: {}, error: '无法解析工作流' }
  }

  if (graph.executionOrder.length === 0) {
    return { success: false, steps: [], context: {}, error: '工作流中没有 ServiceTask 节点' }
  }

  const ffmpeg = getElectronFfmpeg()
  let context: Record<string, unknown>
  try {
    context = initializeWorkflowContext(graph, entryInputs)
  } catch (error) {
    return { success: false, steps: [], context: {}, error: (error as Error).message }
  }

  const steps: WorkflowStepResult[] = []
  const fallbackInput = typeof entryInputs === 'string'
    ? entryInputs
    : ('path' in entryInputs
      ? entryInputs.path
      : (Object.values(entryInputs)[0]?.path || ''))

  const taskMap = new Map(graph.tasks.map(task => [task.id, task]))
  const taskNames = new Map(graph.tasks.map(task => [task.id, task.name || task.id]))

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
      assertJoinBarrierReady(graph, stepId, context)

      if (config.action === 'concat') {
        const upstreamTaskIds = collectUpstreamServiceTasks(stepId, graph)
        const branchPaths = resolveBranchOutputPaths(upstreamTaskIds, graph, context)
        const concatMode = config.concat?.mode || 'copy'

        if (concatMode === 'copy') {
          const validation = validateCopyMergeCompatibility(upstreamTaskIds, context, taskNames)
          if (!validation.ok) {
            throw new Error(validation.message || 'copy 合并参数校验失败')
          }

          const listResult = await ffmpeg.createConcatList({ filePaths: branchPaths })
          if (!listResult.success || !listResult.path) {
            throw new Error(listResult.error || '无法创建合并列表')
          }

          const listPath = listResult.path
          stepResult.inputPath = branchPaths.join(', ')

          const outputKey = getJobOutputVar(config, stepId)
          const ext = getJobOutputFormat(config)
          const outputPathResult = await ffmpeg.createOutputPath({ stepId, ext })
          if (!outputPathResult.success || !outputPathResult.path) {
            throw new Error(outputPathResult.error || '无法创建输出路径')
          }
          const outputPath = outputPathResult.path

          stepResult.command = await getCommandPreview(ffmpeg, config, listPath, outputPath)
          logStepCommand(stepId, stepResult.command)
          onStepUpdate?.({ ...stepResult })

          const runResult = await ffmpeg.runJob({
            config,
            inputPath: listPath,
            outputPath,
            taskId: stepId,
            duration: getDurationFromContext(context)
          })

          stepResult.outputPath = outputPath
          stepResult.stdout = runResult.stdout
          stepResult.stderr = runResult.stderr
          stepResult.exitCode = runResult.code
          stepResult.progressPercent = runResult.success ? 100 : stepResult.progressPercent

          if (!runResult.success) {
            stepResult.status = 'failed'
            stepResult.error = runResult.errorReason || runResult.stderr || `FFmpeg 退出码: ${runResult.code}`
            steps.push(stepResult)
            onStepUpdate?.(stepResult)
            return { success: false, steps, context, error: stepResult.error }
          }

          stepResult.status = 'success'
          stepResult.mediaInfo = await recordStepOutputContext(ffmpeg, stepId, outputPath, outputKey, context)
        } else {
          const segmentDurations = getSegmentDurations(upstreamTaskIds, context)
          const segmentHasAudio = getSegmentHasAudio(upstreamTaskIds, context)
          const firstBranchInfo = context[`${upstreamTaskIds[0]}.info`] as MediaInfo | undefined
          const targetSize = firstBranchInfo?.width && firstBranchInfo?.height
            ? { width: firstBranchInfo.width, height: firstBranchInfo.height }
            : undefined
          const commandOptions: BuildJobCommandOptions = {
            inputPaths: branchPaths,
            segmentDurations,
            segmentHasAudio,
            targetSize
          }

          stepResult.inputPath = branchPaths.join(', ')

          const outputKey = getJobOutputVar(config, stepId)
          const ext = getJobOutputFormat(config)
          const outputPathResult = await ffmpeg.createOutputPath({ stepId, ext })
          if (!outputPathResult.success || !outputPathResult.path) {
            throw new Error(outputPathResult.error || '无法创建输出路径')
          }
          const outputPath = outputPathResult.path

          stepResult.command = await getCommandPreview(
            ffmpeg,
            config,
            branchPaths[0],
            outputPath,
            [],
            commandOptions
          )
          logStepCommand(stepId, stepResult.command)
          onStepUpdate?.({ ...stepResult })

          const totalDuration = segmentDurations.reduce((sum, value) => sum + value, 0)
          const runResult = await ffmpeg.runJob({
            config,
            inputPath: branchPaths[0],
            outputPath,
            taskId: stepId,
            duration: totalDuration,
            inputPaths: branchPaths,
            segmentDurations,
            segmentHasAudio
          })

          stepResult.outputPath = outputPath
          stepResult.stdout = runResult.stdout
          stepResult.stderr = runResult.stderr
          stepResult.exitCode = runResult.code
          stepResult.progressPercent = runResult.success ? 100 : stepResult.progressPercent

          if (!runResult.success) {
            stepResult.status = 'failed'
            stepResult.error = runResult.errorReason || runResult.stderr || `FFmpeg 退出码: ${runResult.code}`
            steps.push(stepResult)
            onStepUpdate?.(stepResult)
            return { success: false, steps, context, error: stepResult.error }
          }

          stepResult.status = 'success'
          stepResult.mediaInfo = await recordStepOutputContext(ffmpeg, stepId, outputPath, outputKey, context)
        }

        steps.push(stepResult)
        onStepUpdate?.(stepResult)
        continue
      }

      const inputPath = resolveJobInput(config, context, {
        inputFilePath: fallbackInput,
        prevOutput: resolveImmediateUpstreamOutput(stepId, graph, context),
        stepId
      })
      stepResult.inputPath = inputPath

      if (config.action === 'probe') {
        stepResult.status = 'failed'
        stepResult.error = '工作流含已废弃的「探测信息」节点，请重新打开流程以自动迁移，或手动删除该节点'
        steps.push(stepResult)
        onStepUpdate?.(stepResult)
        return { success: false, steps, context, error: stepResult.error }
      }

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

      const duration = config.action === 'trim'
        ? parseTrimDuration(config)
        : getDurationFromContext(context)

      const unsubscribe = ffmpeg.onProgress?.((data) => {
        if (data.taskId !== stepId) return
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
          taskId: stepId,
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
      stepResult.mediaInfo = await recordStepOutputContext(ffmpeg, stepId, outputPath, outputKey, context)

      steps.push(stepResult)
      onStepUpdate?.(stepResult)
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
