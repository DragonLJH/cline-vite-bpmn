import { create } from 'zustand'
import type { ProcessDefinition, BpmnElement, BpmnHistory, FfmpegJobConfig, MediaInfo } from '../types/bpmn'
import { DEFAULT_BPMN_XML as FFMPEG_DEFAULT_BPMN_XML, createEmptyBpmnXml } from '../services/ffmpeg/defaultTemplate'
import { migrateProbeNodesFromBpmnXml } from '../services/ffmpeg/probeNodeMigration'
import type { WorkflowEntryPayload } from '../services/ffmpeg/workflowRunner'
import { formatSecondsToFfmpegSeek, formatSecondsToFfmpegTime } from '../services/ffmpeg/timeUtils'
import { readPreviewAsDataUrl } from '../services/ffmpeg/previewUtils'
import {
  buildAudioPlaceholderDataUrl,
  buildNodePreviewSourceKey,
  buildSnapshotTimeCandidates,
  collectEntryTaskIds,
  isVideoMedia,
  resolveEntryNodePreviewSpec
} from '../services/ffmpeg/nodePreviewService'
import { parseWorkflowGraph } from '../utils/bpmnParser'

const DEFAULT_BPMN_XML = FFMPEG_DEFAULT_BPMN_XML

export type NodePreviewDisplayKind = 'video' | 'audio' | 'placeholder' | 'loading' | 'error'

export interface NodePreviewState {
  dataUrl: string | null
  kind: NodePreviewDisplayKind
  sourceKey: string
  error?: string
}

export type FfmpegPageTab = 'designer' | 'xml' | 'nodes' | 'execute'

export interface EntryInputState {
  path: string | null
  mediaInfo: MediaInfo | null
  probing: boolean
  error: string | null
}

export const DEFAULT_ENTRY_INPUT_STATE: EntryInputState = {
  path: null,
  mediaInfo: null,
  probing: false,
  error: null
}

export interface TimelineThumbnail {
  time: number
  dataUrl: string | null
  loading?: boolean
  error?: string
}

export interface PreviewContext {
  inputPath: string | null
  mediaInfo: MediaInfo | null
  entryInputs: Record<string, EntryInputState>
  activePreviewTaskId: string | null
  previewFramePath: string | null
  previewFrameDataUrl: string | null
  previewFrameTime: number
  previewMode: 'snapshot' | 'video' | 'none'
  previewLoading: boolean
  previewError: string | null
  timelineThumbnailKey: string | null
  timelineThumbnails: TimelineThumbnail[]
  timelineThumbnailCache: Record<string, TimelineThumbnail[]>
  timelineThumbnailsLoading: boolean
}

const DEFAULT_PREVIEW_CONTEXT: PreviewContext = {
  inputPath: null,
  mediaInfo: null,
  entryInputs: {},
  activePreviewTaskId: null,
  previewFramePath: null,
  previewFrameDataUrl: null,
  previewFrameTime: 0,
  previewMode: 'none',
  previewLoading: false,
  previewError: null,
  timelineThumbnailKey: null,
  timelineThumbnails: [],
  timelineThumbnailCache: {},
  timelineThumbnailsLoading: false
}

function buildTimelineThumbnailKey(inputPath: string, durationSeconds: number, count: number) {
  return `${inputPath}::${Math.round(durationSeconds * 10) / 10}::${count}`
}

function createTimelineThumbnailSlots(durationSeconds: number, count: number): TimelineThumbnail[] {
  const safeCount = Math.max(1, count)
  const safeDuration = Math.max(0, durationSeconds)
  const lastFrameTime = Math.max(0, safeDuration - 0.1)
  return Array.from({ length: safeCount }, (_, index) => {
    const time = safeCount === 1 ? 0 : (lastFrameTime * index) / (safeCount - 1)
    return {
      time,
      dataUrl: null,
      loading: true
    }
  })
}

function getTimelineThumbnailLoadOrder(count: number): number[] {
  const indexes = new Set<number>()
  indexes.add(0)
  indexes.add(Math.floor((count - 1) / 2))
  indexes.add(count - 1)
  for (let index = 0; index < count; index += 1) {
    indexes.add(index)
  }
  return Array.from(indexes).filter(index => index >= 0 && index < count)
}

function mirrorSingleEntryPreview(entryInputs: Record<string, EntryInputState>, taskIds: string[]) {
  if (taskIds.length !== 1) {
    return { inputPath: null as string | null, mediaInfo: null as MediaInfo | null }
  }
  const state = entryInputs[taskIds[0]]
  return {
    inputPath: state?.path ?? null,
    mediaInfo: state?.mediaInfo ?? null
  }
}

interface FfmpegBpmnState {
  processList: ProcessDefinition[]
  currentProcessId: string | null
  bpmnXml: string
  selectedElement: BpmnElement | null
  modelerRef: any
  history: BpmnHistory
  isLoading: boolean
  hasUnsavedChanges: boolean
  zoomLevel: number
  minimapOpen: boolean
  pendingFfmpegConfigs: Record<string, FfmpegJobConfig>
  previewContext: PreviewContext
  nodePreviews: Record<string, NodePreviewState>
  nodePreviewCache: Record<string, string | null>
  activeTab: FfmpegPageTab
  modelerXmlSyncToken: number

  setProcessList: (list: ProcessDefinition[]) => void
  addProcess: (process: ProcessDefinition) => void
  updateProcess: (id: string, data: Partial<ProcessDefinition>) => void
  deleteProcess: (id: string) => void
  setCurrentProcessId: (id: string | null) => void
  setBpmnXml: (xml: string) => void
  setBpmnXmlFromModeler: (xml: string) => void
  setSelectedElement: (element: BpmnElement | null) => void
  pushToUndoStack: (xml: string) => void
  undo: () => string | null
  redo: () => string | null
  clearHistory: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  setLoading: (loading: boolean) => void
  setHasUnsavedChanges: (changed: boolean) => void
  setZoomLevel: (level: number) => void
  setMinimapOpen: (open: boolean) => void
  setModelerRef: (ref: any) => void
  getCurrentProcess: () => ProcessDefinition | null
  createNewProcess: (name: string, description?: string) => ProcessDefinition
  duplicateProcess: (id: string) => ProcessDefinition | null
  getDefaultXml: () => string
  updateElementProperty: (elementId: string, property: string, value: any) => boolean
  setPendingFfmpegConfig: (elementId: string, config: FfmpegJobConfig) => void
  clearPendingFfmpegConfig: (elementId: string) => void
  getPendingFfmpegConfigs: () => Record<string, FfmpegJobConfig>
  setInputPath: (path: string | null) => void
  setMediaInfo: (info: MediaInfo | null) => void
  reconcileEntryInputs: (entryTaskIds: string[]) => void
  setEntryInputPath: (taskId: string, path: string | null) => void
  setEntryMediaInfo: (taskId: string, info: MediaInfo | null) => void
  setEntryProbing: (taskId: string, probing: boolean) => void
  setEntryInputError: (taskId: string, error: string | null) => void
  setActivePreviewTaskId: (taskId: string | null) => void
  getEntryInputsForRun: () => Record<string, WorkflowEntryPayload>
  getPreviewSourceForTask: (taskId: string | null) => { inputPath: string | null; mediaInfo: MediaInfo | null }
  setPreviewFrame: (path: string | null, time: number, dataUrl?: string | null) => void
  setPreviewMode: (mode: PreviewContext['previewMode']) => void
  ensureTimelineThumbnails: (inputPath: string | null, durationSeconds: number, count?: number) => Promise<void>
  clearTimelineThumbnails: () => void
  clearPreviewContext: () => void
  setActiveTab: (tab: FfmpegPageTab) => void
  refreshPreview: (timeSeconds?: number) => Promise<void>
  setNodePreview: (taskId: string, preview: NodePreviewState) => void
  clearNodePreview: (taskId: string) => void
  clearNodePreviews: () => void
  ensureNodePreview: (taskId: string) => Promise<void>
  ensureAllEntryNodePreviews: () => Promise<void>
}

const MAX_HISTORY_SIZE = 50
const NODE_PREVIEW_REFRESH_DEBOUNCE_MS = 300
const NODE_PREVIEW_SNAPSHOT_TIMEOUT_MS = 30000

const nodePreviewRefreshTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const nodePreviewPromises = new Map<string, Promise<void>>()
const nodePreviewGeneration: Record<string, number> = {}

function bumpNodePreviewGeneration(taskId: string): number {
  const next = (nodePreviewGeneration[taskId] ?? 0) + 1
  nodePreviewGeneration[taskId] = next
  return next
}

function invalidateNodePreviewTask(taskId: string) {
  bumpNodePreviewGeneration(taskId)
  nodePreviewPromises.delete(taskId)
}

function syncNodePreviewFromPreviewFrame(
  get: () => FfmpegBpmnState,
  set: (partial: Partial<FfmpegBpmnState> | ((state: FfmpegBpmnState) => Partial<FfmpegBpmnState>)) => void,
  taskId: string,
  timeSeconds: number,
  dataUrl: string
) {
  const entry = get().previewContext.entryInputs[taskId]
  const inputPath = entry?.path
  const mediaInfo = entry?.mediaInfo
  if (!inputPath || !mediaInfo) return

  const kind = isVideoMedia(mediaInfo) ? 'video' : 'audio'
  const sourceKey = buildNodePreviewSourceKey(inputPath, timeSeconds, kind)

  set((state) => ({
    nodePreviewCache: { ...state.nodePreviewCache, [sourceKey]: dataUrl }
  }))
  get().setNodePreview(taskId, { kind, dataUrl, sourceKey })
}

function shouldRefreshNodePreviewForConfig(
  prev: FfmpegJobConfig | undefined,
  next: FfmpegJobConfig
): boolean {
  if (!prev) return true
  if (prev.action !== next.action) return true
  if (prev.trim?.start !== next.trim?.start) return true
  if (prev.trim?.duration !== next.trim?.duration) return true
  return false
}

function scheduleNodePreviewRefresh(get: () => FfmpegBpmnState, taskId: string) {
  if (nodePreviewRefreshTimers[taskId]) {
    clearTimeout(nodePreviewRefreshTimers[taskId])
  }
  nodePreviewRefreshTimers[taskId] = setTimeout(() => {
    delete nodePreviewRefreshTimers[taskId]
    void get().ensureNodePreview(taskId)
  }, NODE_PREVIEW_REFRESH_DEBOUNCE_MS)
}

function fireNodePreviewUpdated(modelerRef: unknown) {
  if (!modelerRef || typeof modelerRef !== 'object') return
  try {
    const eventBus = (modelerRef as { get?: (name: string) => { fire: (event: string) => void } }).get?.('eventBus')
    eventBus?.fire('nodePreview.updated')
  } catch {
    // ignore
  }
}

async function captureVideoSnapshotDataUrl(
  inputPath: string,
  timeSeconds: number
): Promise<string | null> {
  if (!window.electronAPI?.ffmpeg?.snapshot) {
    throw new Error('FFmpeg snapshot 不可用')
  }

  const result = await withTimeout(
    window.electronAPI.ffmpeg.snapshot({
      inputPath,
      time: formatSecondsToFfmpegSeek(timeSeconds),
      accurate: true
    }),
    NODE_PREVIEW_SNAPSHOT_TIMEOUT_MS,
    '截帧超时'
  )

  if (!result.success || !result.path) {
    throw new Error(result.error || '截帧失败')
  }

  const dataUrl = await readPreviewAsDataUrl(result.path)
  if (!dataUrl) {
    throw new Error('读取预览图失败')
  }
  return dataUrl
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function captureVideoSnapshotWithFallback(
  inputPath: string,
  primaryTimeSeconds: number
): Promise<{ dataUrl: string; timeSeconds: number }> {
  const candidates = buildSnapshotTimeCandidates(primaryTimeSeconds)
  let lastError: Error | null = null

  for (const timeSeconds of candidates) {
    try {
      const dataUrl = await captureVideoSnapshotDataUrl(inputPath, timeSeconds)
      if (dataUrl) {
        return { dataUrl, timeSeconds }
      }
    } catch (error) {
      lastError = error as Error
    }
  }

  throw lastError || new Error('截帧失败')
}

export const useFfmpegBpmnStore = create<FfmpegBpmnState>((set, get) => ({
  processList: [],
  currentProcessId: null,
  bpmnXml: DEFAULT_BPMN_XML,
  selectedElement: null,
  history: {
    undoStack: [],
    redoStack: [],
    maxSize: MAX_HISTORY_SIZE
  },
  isLoading: false,
  hasUnsavedChanges: false,
  zoomLevel: 1,
  minimapOpen: false,
  modelerRef: null,
  pendingFfmpegConfigs: {},
  previewContext: { ...DEFAULT_PREVIEW_CONTEXT },
  nodePreviews: {},
  nodePreviewCache: {},
  activeTab: 'designer',
  modelerXmlSyncToken: 0,

  setProcessList: (list) => set({ processList: list }),

  addProcess: (process) => set((state) => ({
    processList: [...state.processList, process]
  })),

  updateProcess: (id, data) => set((state) => ({
    processList: state.processList.map(p =>
      p.id === id ? { ...p, ...data, updatedAt: Date.now() } : p
    )
  })),

  deleteProcess: (id) => set((state) => ({
    processList: state.processList.filter(p => p.id !== id),
    currentProcessId: state.currentProcessId === id ? null : state.currentProcessId
  })),

  setCurrentProcessId: (id) => set({ currentProcessId: id }),
  setBpmnXml: (xml) => {
    const { xml: migratedXml, migrated } = migrateProbeNodesFromBpmnXml(xml)
    set((state) => ({
      bpmnXml: migratedXml,
      hasUnsavedChanges: migrated ? true : state.hasUnsavedChanges
    }))
  },
  setBpmnXmlFromModeler: (xml) => set((state) => ({
    bpmnXml: xml,
    modelerXmlSyncToken: state.modelerXmlSyncToken + 1
  })),
  setSelectedElement: (element) => set({ selectedElement: element }),

  pushToUndoStack: (xml) => set((state) => {
    const newUndoStack = [...state.history.undoStack, xml]
    if (newUndoStack.length > MAX_HISTORY_SIZE) {
      newUndoStack.shift()
    }
    return {
      history: {
        ...state.history,
        undoStack: newUndoStack,
        redoStack: []
      },
      hasUnsavedChanges: true
    }
  }),

  undo: () => {
    const state = get()
    if (state.history.undoStack.length === 0) return null

    const previousXml = state.history.undoStack[state.history.undoStack.length - 1]
    const { xml: migratedXml } = migrateProbeNodesFromBpmnXml(previousXml)
    set({
      history: {
        ...state.history,
        undoStack: state.history.undoStack.slice(0, -1),
        redoStack: [...state.history.redoStack, state.bpmnXml]
      },
      bpmnXml: migratedXml
    })
    return migratedXml
  },

  redo: () => {
    const state = get()
    if (state.history.redoStack.length === 0) return null

    const nextXml = state.history.redoStack[state.history.redoStack.length - 1]
    const { xml: migratedXml } = migrateProbeNodesFromBpmnXml(nextXml)
    set({
      history: {
        ...state.history,
        redoStack: state.history.redoStack.slice(0, -1),
        undoStack: [...state.history.undoStack, state.bpmnXml]
      },
      bpmnXml: migratedXml
    })
    return migratedXml
  },

  clearHistory: () => set({
    history: {
      undoStack: [],
      redoStack: [],
      maxSize: MAX_HISTORY_SIZE
    }
  }),

  canUndo: () => get().history.undoStack.length > 0,
  canRedo: () => get().history.redoStack.length > 0,
  setLoading: (loading) => set({ isLoading: loading }),
  setHasUnsavedChanges: (changed) => set({ hasUnsavedChanges: changed }),
  setZoomLevel: (level) => set({ zoomLevel: Math.max(0.2, Math.min(4, level)) }),
  setMinimapOpen: (open) => set({ minimapOpen: open }),
  setModelerRef: (ref) => set({ modelerRef: ref }),

  getCurrentProcess: () => {
    const state = get()
    return state.processList.find(p => p.id === state.currentProcessId) || null
  },

  createNewProcess: (name, description) => {
    const now = Date.now()
    const id = `Process_${now}`
    const newProcess: ProcessDefinition = {
      id,
      name,
      description,
      bpmnXml: createEmptyBpmnXml(id, name),
      createdAt: now,
      updatedAt: now,
      version: 1
    }
    return newProcess
  },

  duplicateProcess: (id) => {
    const state = get()
    const original = state.processList.find(p => p.id === id)
    if (!original) return null

    const now = Date.now()
    const newId = `Process_${now}`
    const duplicated: ProcessDefinition = {
      ...original,
      id: newId,
      name: `${original.name} (副本)`,
      bpmnXml: original.bpmnXml.replace(new RegExp(original.id, 'g'), newId),
      createdAt: now,
      updatedAt: now,
      version: 1
    }
    return duplicated
  },

  getDefaultXml: () => DEFAULT_BPMN_XML,

  setPendingFfmpegConfig: (elementId, config) => {
    const prev = get().pendingFfmpegConfigs[elementId]
    set((state) => ({
      pendingFfmpegConfigs: { ...state.pendingFfmpegConfigs, [elementId]: config }
    }))
    if (shouldRefreshNodePreviewForConfig(prev, config)) {
      invalidateNodePreviewTask(elementId)
      scheduleNodePreviewRefresh(get, elementId)
    }
  },

  clearPendingFfmpegConfig: (elementId) => set((state) => {
    const next = { ...state.pendingFfmpegConfigs }
    delete next[elementId]
    return { pendingFfmpegConfigs: next }
  }),

  getPendingFfmpegConfigs: () => get().pendingFfmpegConfigs,

  setInputPath: (path) => set((state) => ({
    previewContext: {
      ...state.previewContext,
      inputPath: path,
      previewFramePath: null,
      previewFrameDataUrl: null,
      previewMode: path ? state.previewContext.previewMode : 'none',
      previewError: null,
      timelineThumbnailKey: null,
      timelineThumbnails: [],
      timelineThumbnailsLoading: false
    }
  })),

  setMediaInfo: (info) => set((state) => ({
    previewContext: { ...state.previewContext, mediaInfo: info }
  })),

  reconcileEntryInputs: (entryTaskIds) => {
    set((state) => {
      const nextEntryInputs: Record<string, EntryInputState> = {}
      entryTaskIds.forEach(taskId => {
        nextEntryInputs[taskId] = state.previewContext.entryInputs[taskId] || { ...DEFAULT_ENTRY_INPUT_STATE }
      })
      const mirrored = mirrorSingleEntryPreview(nextEntryInputs, entryTaskIds)
      const activePreviewTaskId = state.previewContext.activePreviewTaskId && nextEntryInputs[state.previewContext.activePreviewTaskId]
        ? state.previewContext.activePreviewTaskId
        : (entryTaskIds[0] ?? null)

      return {
        previewContext: {
          ...state.previewContext,
          entryInputs: nextEntryInputs,
          activePreviewTaskId,
          inputPath: mirrored.inputPath,
          mediaInfo: mirrored.mediaInfo
        }
      }
    })
    entryTaskIds.forEach(taskId => {
      const entry = get().previewContext.entryInputs[taskId]
      if (entry?.path && entry?.mediaInfo) {
        void get().ensureNodePreview(taskId)
      }
    })
  },

  setEntryInputPath: (taskId, path) => {
    set((state) => {
      const entryInputs = {
        ...state.previewContext.entryInputs,
        [taskId]: {
          ...(state.previewContext.entryInputs[taskId] || DEFAULT_ENTRY_INPUT_STATE),
          path,
          mediaInfo: path ? state.previewContext.entryInputs[taskId]?.mediaInfo ?? null : null,
          error: null
        }
      }
      const taskIds = Object.keys(entryInputs)
      const mirrored = mirrorSingleEntryPreview(entryInputs, taskIds)

      return {
        previewContext: {
          ...state.previewContext,
          entryInputs,
          inputPath: mirrored.inputPath,
          mediaInfo: mirrored.mediaInfo,
          previewFramePath: null,
          previewFrameDataUrl: null,
          timelineThumbnailKey: null,
          timelineThumbnails: [],
          timelineThumbnailsLoading: false
        }
      }
    })
    if (!path) {
      get().clearNodePreview(taskId)
    }
  },

  setEntryMediaInfo: (taskId, info) => {
    set((state) => {
      const entryInputs = {
        ...state.previewContext.entryInputs,
        [taskId]: {
          ...(state.previewContext.entryInputs[taskId] || DEFAULT_ENTRY_INPUT_STATE),
          mediaInfo: info
        }
      }
      const taskIds = Object.keys(entryInputs)
      const mirrored = mirrorSingleEntryPreview(entryInputs, taskIds)
      const activeId = state.previewContext.activePreviewTaskId
      const activeMirrored = activeId && entryInputs[activeId]
        ? { inputPath: entryInputs[activeId].path, mediaInfo: entryInputs[activeId].mediaInfo }
        : mirrored

      return {
        previewContext: {
          ...state.previewContext,
          entryInputs,
          inputPath: activeMirrored.inputPath,
          mediaInfo: activeMirrored.mediaInfo
        }
      }
    })
    if (info) {
      void get().ensureNodePreview(taskId)
    } else {
      get().clearNodePreview(taskId)
    }
  },

  setEntryProbing: (taskId, probing) => set((state) => ({
    previewContext: {
      ...state.previewContext,
      entryInputs: {
        ...state.previewContext.entryInputs,
        [taskId]: {
          ...(state.previewContext.entryInputs[taskId] || DEFAULT_ENTRY_INPUT_STATE),
          probing
        }
      }
    }
  })),

  setEntryInputError: (taskId, error) => set((state) => ({
    previewContext: {
      ...state.previewContext,
      entryInputs: {
        ...state.previewContext.entryInputs,
        [taskId]: {
          ...(state.previewContext.entryInputs[taskId] || DEFAULT_ENTRY_INPUT_STATE),
          error
        }
      }
    }
  })),

  setActivePreviewTaskId: (taskId) => set((state) => {
    const entry = taskId ? state.previewContext.entryInputs[taskId] : null
    return {
      previewContext: {
        ...state.previewContext,
        activePreviewTaskId: taskId,
        inputPath: entry?.path ?? state.previewContext.inputPath,
        mediaInfo: entry?.mediaInfo ?? state.previewContext.mediaInfo,
        previewFramePath: null,
        previewFrameDataUrl: null,
        timelineThumbnailKey: null,
        timelineThumbnails: [],
        timelineThumbnailsLoading: false
      }
    }
  }),

  getEntryInputsForRun: () => {
    const { entryInputs } = get().previewContext
    const result: Record<string, WorkflowEntryPayload> = {}
    Object.entries(entryInputs).forEach(([taskId, state]) => {
      if (state.path) {
        result[taskId] = {
          path: state.path,
          mediaInfo: state.mediaInfo ?? undefined
        }
      }
    })
    return result
  },

  getPreviewSourceForTask: (taskId) => {
    const { previewContext } = get()
    if (taskId && previewContext.entryInputs[taskId]) {
      return {
        inputPath: previewContext.entryInputs[taskId].path,
        mediaInfo: previewContext.entryInputs[taskId].mediaInfo
      }
    }
    return {
      inputPath: previewContext.inputPath,
      mediaInfo: previewContext.mediaInfo
    }
  },

  setPreviewFrame: (path, time, dataUrl = null) => {
    const syncTaskId = get().previewContext.activePreviewTaskId
      ?? get().selectedElement?.id
      ?? null
    set((state) => ({
      previewContext: {
        ...state.previewContext,
        previewFramePath: path,
        previewFrameDataUrl: dataUrl,
        previewFrameTime: time,
        previewMode: path || dataUrl ? 'snapshot' : state.previewContext.previewMode,
        previewLoading: false,
        previewError: null
      }
    }))
    if (syncTaskId && dataUrl) {
      syncNodePreviewFromPreviewFrame(get, set, syncTaskId, time, dataUrl)
    }
  },

  setPreviewMode: (mode) => set((state) => ({
    previewContext: { ...state.previewContext, previewMode: mode }
  })),

  ensureTimelineThumbnails: async (inputPath, durationSeconds, count = 10) => {
    if (!inputPath || durationSeconds <= 0 || !window.electronAPI?.ffmpeg?.snapshot) {
      set((state) => ({
        previewContext: {
          ...state.previewContext,
          timelineThumbnailKey: null,
          timelineThumbnails: [],
          timelineThumbnailsLoading: false
        }
      }))
      return
    }

    const key = buildTimelineThumbnailKey(inputPath, durationSeconds, count)
    const cached = get().previewContext.timelineThumbnailCache[key]
    if (cached?.length) {
      set((state) => ({
        previewContext: {
          ...state.previewContext,
          timelineThumbnailKey: key,
          timelineThumbnails: cached,
          timelineThumbnailsLoading: false
        }
      }))
      return
    }

    if (
      get().previewContext.timelineThumbnailKey === key &&
      get().previewContext.timelineThumbnailsLoading
    ) {
      return
    }

    const slots = createTimelineThumbnailSlots(durationSeconds, count)
    set((state) => ({
      previewContext: {
        ...state.previewContext,
        timelineThumbnailKey: key,
        timelineThumbnails: slots,
        timelineThumbnailsLoading: true
      }
    }))

    const next = [...slots]
    const loadOrder = getTimelineThumbnailLoadOrder(next.length)
    for (const index of loadOrder) {
      if (get().previewContext.timelineThumbnailKey !== key) return

      const item = next[index]
      try {
        const result = await window.electronAPI.ffmpeg.snapshot({
          inputPath,
          time: formatSecondsToFfmpegTime(item.time),
          accurate: false
        })
        const dataUrl = result.success && result.path
          ? await readPreviewAsDataUrl(result.path)
          : null
        next[index] = {
          ...item,
          dataUrl,
          loading: false,
          error: dataUrl ? undefined : (result.error || '截帧失败')
        }
      } catch (error) {
        next[index] = {
          ...item,
          dataUrl: null,
          loading: false,
          error: (error as Error).message
        }
      }

      if (get().previewContext.timelineThumbnailKey !== key) return
      set((state) => ({
        previewContext: {
          ...state.previewContext,
          timelineThumbnails: [...next]
        }
      }))
    }

    if (get().previewContext.timelineThumbnailKey !== key) return
    set((state) => ({
      previewContext: {
        ...state.previewContext,
        timelineThumbnails: next,
        timelineThumbnailCache: {
          ...state.previewContext.timelineThumbnailCache,
          [key]: next
        },
        timelineThumbnailsLoading: false
      }
    }))
  },

  clearTimelineThumbnails: () => set((state) => ({
    previewContext: {
      ...state.previewContext,
      timelineThumbnailKey: null,
      timelineThumbnails: [],
      timelineThumbnailsLoading: false
    }
  })),

  clearPreviewContext: () => {
    nodePreviewPromises.clear()
    Object.keys(nodePreviewRefreshTimers).forEach(taskId => {
      clearTimeout(nodePreviewRefreshTimers[taskId])
      delete nodePreviewRefreshTimers[taskId]
    })
    set({
      previewContext: { ...DEFAULT_PREVIEW_CONTEXT },
      nodePreviews: {},
      nodePreviewCache: {}
    })
    fireNodePreviewUpdated(get().modelerRef)
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  refreshPreview: async (timeSeconds = 0) => {
    const { previewContext } = get()
    const activeTaskId = previewContext.activePreviewTaskId
    const previewSource = get().getPreviewSourceForTask(activeTaskId)
    const inputPath = previewSource.inputPath
    if (!inputPath || !window.electronAPI?.ffmpeg?.snapshot) {
      set((state) => ({
        previewContext: {
          ...state.previewContext,
          previewMode: inputPath ? 'video' : 'none',
          previewLoading: false
        }
      }))
      return
    }

    set((state) => ({
      previewContext: {
        ...state.previewContext,
        previewLoading: true,
        previewError: null
      }
    }))

    try {
      const time = formatSecondsToFfmpegTime(timeSeconds)
      const result = await window.electronAPI.ffmpeg.snapshot({
        inputPath,
        time,
        accurate: true
      })

      if (result.success && result.path) {
        const dataUrl = await readPreviewAsDataUrl(result.path)
        get().setPreviewFrame(result.path, timeSeconds, dataUrl)
      } else {
        set((state) => ({
          previewContext: {
            ...state.previewContext,
            previewMode: 'video',
            previewLoading: false,
            previewError: result.error || '截帧失败，已回退视频预览'
          }
        }))
      }
    } catch (error) {
      set((state) => ({
        previewContext: {
          ...state.previewContext,
          previewMode: 'video',
          previewLoading: false,
          previewError: (error as Error).message
        }
      }))
    }
  },

  setNodePreview: (taskId, preview) => {
    set((state) => ({
      nodePreviews: { ...state.nodePreviews, [taskId]: preview }
    }))
    fireNodePreviewUpdated(get().modelerRef)
  },

  clearNodePreview: (taskId) => {
    set((state) => {
      const next = { ...state.nodePreviews }
      delete next[taskId]
      return { nodePreviews: next }
    })
    fireNodePreviewUpdated(get().modelerRef)
  },

  clearNodePreviews: () => {
    set({ nodePreviews: {}, nodePreviewCache: {} })
    fireNodePreviewUpdated(get().modelerRef)
  },

  ensureNodePreview: async (taskId) => {
    const existing = nodePreviewPromises.get(taskId)
    if (existing) return existing

    const generation = nodePreviewGeneration[taskId] ?? 0

    const run = (async () => {
      const state = get()
      const graph = parseWorkflowGraph(state.bpmnXml)
      const spec = resolveEntryNodePreviewSpec(
        taskId,
        graph,
        state.previewContext.entryInputs,
        state.pendingFfmpegConfigs
      )

      if (spec.kind === 'none' || !spec.inputPath) {
        if ((nodePreviewGeneration[taskId] ?? 0) === generation) {
          get().clearNodePreview(taskId)
        }
        return
      }

      const sourceKey = buildNodePreviewSourceKey(spec.inputPath, spec.snapshotTime, spec.kind)
      const cached = get().nodePreviews[taskId]
      if (cached?.sourceKey === sourceKey && cached.dataUrl && cached.kind !== 'loading') {
        return
      }

      const previewContext = get().previewContext
      if (
        spec.kind === 'video'
        && previewContext.activePreviewTaskId === taskId
        && previewContext.previewFrameDataUrl
        && Math.abs(previewContext.previewFrameTime - spec.snapshotTime) < 0.05
      ) {
        if ((nodePreviewGeneration[taskId] ?? 0) === generation) {
          syncNodePreviewFromPreviewFrame(
            get,
            set,
            taskId,
            previewContext.previewFrameTime,
            previewContext.previewFrameDataUrl
          )
        }
        return
      }

      const cachedDataUrl = get().nodePreviewCache[sourceKey]
      if (cachedDataUrl) {
        if ((nodePreviewGeneration[taskId] ?? 0) === generation) {
          get().setNodePreview(taskId, {
            kind: spec.kind,
            dataUrl: cachedDataUrl,
            sourceKey
          })
        }
        return
      }

      if ((nodePreviewGeneration[taskId] ?? 0) !== generation) return

      get().setNodePreview(taskId, {
        kind: 'loading',
        dataUrl: null,
        sourceKey
      })

      try {
        let dataUrl: string | null = null
        let usedSourceKey = sourceKey

        if (spec.kind === 'video') {
          const captured = await captureVideoSnapshotWithFallback(
            spec.inputPath,
            spec.snapshotTime
          )
          dataUrl = captured.dataUrl
          usedSourceKey = buildNodePreviewSourceKey(
            spec.inputPath,
            captured.timeSeconds,
            spec.kind
          )
        } else {
          dataUrl = buildAudioPlaceholderDataUrl()
        }

        if ((nodePreviewGeneration[taskId] ?? 0) !== generation) return

        set((current) => ({
          nodePreviewCache: { ...current.nodePreviewCache, [usedSourceKey]: dataUrl }
        }))
        get().setNodePreview(taskId, {
          kind: spec.kind,
          dataUrl,
          sourceKey: usedSourceKey
        })
      } catch (error) {
        if ((nodePreviewGeneration[taskId] ?? 0) !== generation) return
        get().setNodePreview(taskId, {
          kind: 'error',
          dataUrl: null,
          sourceKey,
          error: (error as Error).message
        })
      }
    })()

    nodePreviewPromises.set(taskId, run)
    try {
      await run
    } finally {
      nodePreviewPromises.delete(taskId)
    }
  },

  ensureAllEntryNodePreviews: async () => {
    const graph = parseWorkflowGraph(get().bpmnXml)
    const taskIds = collectEntryTaskIds(graph)
    await Promise.all(taskIds.map(taskId => get().ensureNodePreview(taskId)))
  },

  updateElementProperty: (elementId, property, value) => {
    const state = get()
    const modeler = state.modelerRef
    if (!modeler) return false

    try {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      const element = elementRegistry.get(elementId)
      if (!element) return false

      switch (property) {
        case 'name':
          modeling.updateProperties(element, { name: value })
          break
        case 'id':
          modeling.updateProperties(element, { id: value })
          break
        default:
          modeling.updateProperties(element, { [property]: value })
      }

      set({ hasUnsavedChanges: true })
      return true
    } catch {
      return false
    }
  }
}))
