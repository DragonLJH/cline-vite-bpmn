import type { FfmpegJobConfig, MediaInfo, WorkflowGraph } from '../../types/bpmn'
import type { EntryInputState } from '../../stores/ffmpegBpmnStore'
import { collectEntryInputTasks } from '../../shared/ffmpeg/mergeInputs'
import { clamp, parseTimeToSeconds } from './timeUtils'

export type NodePreviewKind = 'video' | 'audio' | 'none'

const MIN_SNAPSHOT_OFFSET = 0.1

export interface NodePreviewSpec {
  taskId: string
  inputPath: string | null
  mediaInfo: MediaInfo | null
  snapshotTime: number
  kind: NodePreviewKind
}

export function isVideoMedia(info: MediaInfo | null | undefined): boolean {
  return Boolean(info?.width && info?.height)
}

export function resolveSnapshotTimeSeconds(
  config: FfmpegJobConfig | undefined,
  mediaInfo: MediaInfo | null
): number {
  let snapshotTime = 0
  if (config?.action === 'trim' && config.trim?.start != null) {
    snapshotTime = parseTimeToSeconds(config.trim.start)
  }

  const duration = mediaInfo?.durationSeconds
    || parseTimeToSeconds(mediaInfo?.duration)
  if (duration && duration > MIN_SNAPSHOT_OFFSET) {
    snapshotTime = clamp(snapshotTime, 0, duration - MIN_SNAPSHOT_OFFSET)
  } else {
    snapshotTime = Math.max(0, snapshotTime)
  }

  return snapshotTime
}

/** 截帧候选时间点：首选入点，失败则回退 0、0.1s */
export function buildSnapshotTimeCandidates(primarySeconds: number): number[] {
  const candidates = [primarySeconds]
  if (primarySeconds > 0) candidates.push(0)
  if (primarySeconds !== MIN_SNAPSHOT_OFFSET) {
    candidates.push(MIN_SNAPSHOT_OFFSET)
  }
  return [...new Set(candidates.map(value => Math.round(value * 1000) / 1000))]
}

export function buildNodePreviewSourceKey(
  inputPath: string,
  snapshotTime: number,
  kind: Exclude<NodePreviewKind, 'none'>
): string {
  return `${inputPath}::${Math.round(snapshotTime * 100) / 100}::${kind}`
}

export function buildAudioPlaceholderDataUrl(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
    '<rect width="160" height="90" rx="4" fill="#1e293b"/>',
    '<path d="M44 28v34l28-17z" fill="#94a3b8"/>',
    '<rect x="92" y="34" width="4" height="22" fill="#64748b" rx="1"/>',
    '<rect x="100" y="26" width="4" height="38" fill="#64748b" rx="1"/>',
    '<rect x="108" y="30" width="4" height="30" fill="#64748b" rx="1"/>',
    '<rect x="116" y="22" width="4" height="46" fill="#64748b" rx="1"/>',
    '<text x="80" y="78" text-anchor="middle" fill="#64748b" font-size="10" font-family="sans-serif">AUDIO</text>',
    '</svg>'
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function resolveEntryNodePreviewSpec(
  taskId: string,
  graph: WorkflowGraph | null,
  entryInputs: Record<string, EntryInputState>,
  pendingConfigs: Record<string, FfmpegJobConfig>
): NodePreviewSpec {
  const entryIds = new Set(
    graph ? collectEntryInputTasks(graph).map(task => task.id) : []
  )

  if (!entryIds.has(taskId)) {
    return { taskId, inputPath: null, mediaInfo: null, snapshotTime: 0, kind: 'none' }
  }

  const entry = entryInputs[taskId]
  const inputPath = entry?.path ?? null
  const mediaInfo = entry?.mediaInfo ?? null

  if (!inputPath || !mediaInfo) {
    return { taskId, inputPath, mediaInfo, snapshotTime: 0, kind: 'none' }
  }

  const task = graph?.tasks.find(item => item.id === taskId)
  const config = pendingConfigs[taskId] ?? task?.ffmpegConfig
  const snapshotTime = resolveSnapshotTimeSeconds(config, mediaInfo)

  const kind: NodePreviewKind = isVideoMedia(mediaInfo) ? 'video' : 'audio'
  return { taskId, inputPath, mediaInfo, snapshotTime, kind }
}

export function collectEntryTaskIds(graph: WorkflowGraph | null): string[] {
  if (!graph) return []
  return collectEntryInputTasks(graph).map(task => task.id)
}
