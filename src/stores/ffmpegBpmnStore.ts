import { create } from 'zustand'
import type { ProcessDefinition, BpmnElement, BpmnHistory, FfmpegJobConfig, MediaInfo } from '../types/bpmn'
import { DEFAULT_BPMN_XML as FFMPEG_DEFAULT_BPMN_XML } from '../services/ffmpeg/defaultTemplate'
import { migrateProbeNodesFromBpmnXml } from '../services/ffmpeg/probeNodeMigration'
import type { WorkflowEntryPayload } from '../services/ffmpeg/workflowRunner'
import { formatSecondsToFfmpegTime } from '../services/ffmpeg/timeUtils'
import { readPreviewAsDataUrl } from '../services/ffmpeg/previewUtils'

const DEFAULT_BPMN_XML = FFMPEG_DEFAULT_BPMN_XML

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
  previewError: null
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
  clearPreviewContext: () => void
  setActiveTab: (tab: FfmpegPageTab) => void
  refreshPreview: (timeSeconds?: number) => Promise<void>
}

const MAX_HISTORY_SIZE = 50

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
      bpmnXml: DEFAULT_BPMN_XML.replace(/Process_1/g, id),
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

  setPendingFfmpegConfig: (elementId, config) => set((state) => ({
    pendingFfmpegConfigs: { ...state.pendingFfmpegConfigs, [elementId]: config }
  })),

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
      previewError: null
    }
  })),

  setMediaInfo: (info) => set((state) => ({
    previewContext: { ...state.previewContext, mediaInfo: info }
  })),

  reconcileEntryInputs: (entryTaskIds) => set((state) => {
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
  }),

  setEntryInputPath: (taskId, path) => set((state) => {
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
        previewFrameDataUrl: null
      }
    }
  }),

  setEntryMediaInfo: (taskId, info) => set((state) => {
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
  }),

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
        previewFrameDataUrl: null
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

  setPreviewFrame: (path, time, dataUrl = null) => set((state) => ({
    previewContext: {
      ...state.previewContext,
      previewFramePath: path,
      previewFrameDataUrl: dataUrl,
      previewFrameTime: time,
      previewMode: path || dataUrl ? 'snapshot' : state.previewContext.previewMode,
      previewLoading: false,
      previewError: null
    }
  })),

  setPreviewMode: (mode) => set((state) => ({
    previewContext: { ...state.previewContext, previewMode: mode }
  })),

  clearPreviewContext: () => set({ previewContext: { ...DEFAULT_PREVIEW_CONTEXT } }),

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
