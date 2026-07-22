import type { MediaInfo, WorkflowGraph, WorkflowTask } from '../../types/bpmn'
import { getJobOutputVar } from './jobConfig'

export interface CopyMergeValidationResult {
  ok: boolean
  message?: string
}

function formatMediaSummary(info: MediaInfo | undefined): string {
  if (!info) return '未知'
  const codec = info.videoCodec || '-'
  const size = info.width && info.height ? `${info.width}x${info.height}` : '-'
  const fps = info.fps != null ? `${info.fps}fps` : '-'
  return `${codec} / ${size} / ${fps}`
}

export function validateCopyMergeCompatibility(
  taskIds: string[],
  context: Record<string, unknown>,
  taskNames?: Map<string, string>
): CopyMergeValidationResult {
  if (taskIds.length < 2) {
    return { ok: false, message: 'copy 合并至少需要 2 个分支输出' }
  }

  const infos = taskIds.map(taskId => {
    const info = context[`${taskId}.info`] as MediaInfo | undefined
    return { taskId, info }
  })

  const missing = infos.filter(item => !item.info?.videoCodec && !item.info?.width)
  if (missing.length > 0) {
    const labels = missing.map(item => taskNames?.get(item.taskId) || item.taskId).join('、')
    return { ok: false, message: `copy 合并需要各分支输出媒体信息，缺失: ${labels}` }
  }

  const baseline = infos[0].info!
  for (let i = 1; i < infos.length; i += 1) {
    const current = infos[i].info!
    const labelA = taskNames?.get(infos[0].taskId) || infos[0].taskId
    const labelB = taskNames?.get(infos[i].taskId) || infos[i].taskId

    if (baseline.videoCodec && current.videoCodec && baseline.videoCodec !== current.videoCodec) {
      return {
        ok: false,
        message: `copy 合并失败：分支输出参数不一致\n  ${labelA}: ${formatMediaSummary(baseline)}\n  ${labelB}: ${formatMediaSummary(current)}\n建议：先将各分支转码为相同参数，或将合并模式改为「交叉淡化」。`
      }
    }

    if (baseline.width && baseline.height && current.width && current.height
      && (baseline.width !== current.width || baseline.height !== current.height)) {
      return {
        ok: false,
        message: `copy 合并失败：分支分辨率不一致\n  ${labelA}: ${formatMediaSummary(baseline)}\n  ${labelB}: ${formatMediaSummary(current)}\n建议：先将各分支转码为相同参数，或将合并模式改为「交叉淡化」。`
      }
    }

    if (baseline.fps != null && current.fps != null && Math.abs(baseline.fps - current.fps) > 0.1) {
      return {
        ok: false,
        message: `copy 合并失败：分支帧率不一致\n  ${labelA}: ${formatMediaSummary(baseline)}\n  ${labelB}: ${formatMediaSummary(current)}\n建议：先将各分支转码为相同参数，或将合并模式改为「交叉淡化」。`
      }
    }

    const audioA = baseline.audioCodec || ''
    const audioB = current.audioCodec || ''
    if (audioA !== audioB) {
      return {
        ok: false,
        message: `copy 合并失败：分支音频编码不一致\n  ${labelA}: ${formatMediaSummary(baseline)}\n  ${labelB}: ${formatMediaSummary(current)}\n建议：先将各分支转码为相同参数，或将合并模式改为「交叉淡化」。`
      }
    }
  }

  return { ok: true }
}

function isJoinGateway(nodeId: string, graph: WorkflowGraph): boolean {
  if (graph.nodeTypes?.get(nodeId) !== 'bpmn:parallelGateway') return false
  return (graph.reverseAdjacency?.get(nodeId) || []).length >= 2
}

function hasUpstreamServiceTask(taskId: string, graph: WorkflowGraph): boolean {
  const taskIds = new Set(graph.tasks.map(task => task.id))
  const reverseAdjacency = graph.reverseAdjacency || new Map<string, string[]>()
  const queue = [...(reverseAdjacency.get(taskId) || [])]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (taskIds.has(current)) return true
    queue.push(...(reverseAdjacency.get(current) || []))
  }

  return false
}

/** 需要从工作流外部选择输入文件的起始 ServiceTask（无上游 ServiceTask 且 input.source=input） */
export function collectEntryInputTasks(graph: WorkflowGraph): WorkflowTask[] {
  return graph.tasks
    .filter(task => {
      const source = task.ffmpegConfig?.input?.source ?? 'input'
      if (source !== 'input') return false
      if (task.ffmpegConfig?.input?.path) return false
      return !hasUpstreamServiceTask(task.id, graph)
    })
    .sort((a, b) => graph.executionOrder.indexOf(a.id) - graph.executionOrder.indexOf(b.id))
}

/**
 * 判断 ServiceTask 是否紧跟在「汇合网关」之后（网关至少有 2 条入边）。
 * 典型拓扑：分支 → ParallelGateway(Join) → 本 ServiceTask
 */
export function isAfterJoinGateway(taskId: string, graph: WorkflowGraph): boolean {
  const reverseAdjacency = graph.reverseAdjacency
  if (!reverseAdjacency) return false

  const directPredecessors = reverseAdjacency.get(taskId) || []
  return directPredecessors.some(nodeId => isJoinGateway(nodeId, graph))
}

export function canUseMergeAction(taskId: string, graph: WorkflowGraph | null): boolean {
  if (!graph) return false
  if (!isAfterJoinGateway(taskId, graph)) return false
  return collectUpstreamServiceTasks(taskId, graph).length >= 2
}

export function collectUpstreamServiceTasks(
  taskId: string,
  graph: WorkflowGraph
): string[] {
  const taskIds = new Set(graph.tasks.map(task => task.id))
  const reverseAdjacency = graph.reverseAdjacency || new Map<string, string[]>()
  const result: string[] = []
  const visited = new Set<string>()
  const queue = [...(reverseAdjacency.get(taskId) || [])]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    if (taskIds.has(current)) {
      result.push(current)
      continue
    }

    const predecessors = reverseAdjacency.get(current) || []
    queue.push(...predecessors)
  }

  return result.sort(
    (a, b) => graph.executionOrder.indexOf(a) - graph.executionOrder.indexOf(b)
  )
}

/** 沿当前节点向上追溯，找到最近的上游 ServiceTask（同分支链路上的直接前驱） */
export function findImmediateUpstreamServiceTask(
  taskId: string,
  graph: WorkflowGraph
): string | null {
  const taskIds = new Set(graph.tasks.map(task => task.id))
  const reverseAdjacency = graph.reverseAdjacency || new Map<string, string[]>()
  const queue = [...(reverseAdjacency.get(taskId) || [])]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    if (taskIds.has(current)) return current

    queue.push(...(reverseAdjacency.get(current) || []))
  }

  return null
}

/** 解析同分支链路上一步 ServiceTask 的输出路径（用于 input.source=prev） */
export function resolveImmediateUpstreamOutput(
  taskId: string,
  graph: WorkflowGraph,
  context: Record<string, unknown>
): string | undefined {
  const upstreamId = findImmediateUpstreamServiceTask(taskId, graph)
  if (!upstreamId) return undefined

  const legacyOutput = context[`${upstreamId}.output`]
  if (typeof legacyOutput === 'string' && legacyOutput) return legacyOutput

  const task = graph.tasks.find(item => item.id === upstreamId)
  const outputVar = getJobOutputVar(
    task?.ffmpegConfig || { type: 'ffmpeg', action: 'transcode' },
    upstreamId
  )
  const value = context[outputVar]
  if (typeof value === 'string' && value) return value

  return undefined
}

export function resolveBranchOutputPaths(
  upstreamTaskIds: string[],
  graph: WorkflowGraph,
  context: Record<string, unknown>
): string[] {
  const taskMap = new Map(graph.tasks.map(task => [task.id, task]))

  return upstreamTaskIds.map(taskId => {
    const task = taskMap.get(taskId)
    const outputVar = getJobOutputVar(task?.ffmpegConfig || { type: 'ffmpeg', action: 'transcode' }, taskId)
    const legacyKey = `${taskId}.output`
    const value = context[outputVar] ?? context[legacyKey]
    if (typeof value === 'string' && value) return value

    const branchInput = context[`${taskId}.input`]
    if (typeof branchInput === 'string' && branchInput) return branchInput

    throw new Error(`无法解析分支输出: ${taskId}`)
  })
}
