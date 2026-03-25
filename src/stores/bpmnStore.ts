import { create } from 'zustand'
import type { ProcessDefinition, BpmnElement, BpmnHistory } from '../types/bpmn'

// 默认BPMN模板
const DEFAULT_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
  id="Definitions_1" 
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="开始" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="158" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

interface BpmnState {
  // 流程定义列表
  processList: ProcessDefinition[]
  // 当前编辑的流程ID
  currentProcessId: string | null
  // 当前BPMN XML
  bpmnXml: string
  // 选中的元素
  selectedElement: BpmnElement | null
  // BPMN Modeler实例引用
  modelerRef: any
  // 操作历史
  history: BpmnHistory
  // 是否正在加载
  isLoading: boolean
  // 是否有未保存的更改
  hasUnsavedChanges: boolean
  // 缩放级别
  zoomLevel: number
  // 迷你地图是否打开
  minimapOpen: boolean

  // Actions
  setProcessList: (list: ProcessDefinition[]) => void
  addProcess: (process: ProcessDefinition) => void
  updateProcess: (id: string, data: Partial<ProcessDefinition>) => void
  deleteProcess: (id: string) => void
  setCurrentProcessId: (id: string | null) => void
  
  setBpmnXml: (xml: string) => void
  setSelectedElement: (element: BpmnElement | null) => void
  
  // 历史操作
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
  
  // 工具方法
  getCurrentProcess: () => ProcessDefinition | null
  createNewProcess: (name: string, description?: string) => ProcessDefinition
  duplicateProcess: (id: string) => ProcessDefinition | null
  getDefaultXml: () => string
  updateElementProperty: (elementId: string, property: string, value: any) => boolean
}

const MAX_HISTORY_SIZE = 50

export const useBpmnStore = create<BpmnState>((set, get) => ({
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

  setBpmnXml: (xml) => set({ bpmnXml: xml }),

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
        redoStack: [] // 新操作清空重做栈
      },
      hasUnsavedChanges: true
    }
  }),

  undo: () => {
    const state = get()
    if (state.history.undoStack.length === 0) return null
    
    const previousXml = state.history.undoStack[state.history.undoStack.length - 1]
    set({
      history: {
        ...state.history,
        undoStack: state.history.undoStack.slice(0, -1),
        redoStack: [...state.history.redoStack, state.bpmnXml]
      },
      bpmnXml: previousXml
    })
    return previousXml
  },

  redo: () => {
    const state = get()
    if (state.history.redoStack.length === 0) return null
    
    const nextXml = state.history.redoStack[state.history.redoStack.length - 1]
    set({
      history: {
        ...state.history,
        redoStack: state.history.redoStack.slice(0, -1),
        undoStack: [...state.history.undoStack, state.bpmnXml]
      },
      bpmnXml: nextXml
    })
    return nextXml
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
      bpmnXml: DEFAULT_BPMN_XML.replace('Process_1', id),
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

  updateElementProperty: (elementId, property, value) => {
    const state = get()
    const modeler = state.modelerRef
    if (!modeler) {
      console.warn('Modeler not initialized')
      return false
    }

    try {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      
      const element = elementRegistry.get(elementId)
      if (!element) {
        console.warn('Element not found:', elementId)
        return false
      }

      const businessObject = element.businessObject

      // 根据属性类型更新
      switch (property) {
        case 'name':
          modeling.updateProperties(element, { name: value })
          break
        case 'id':
          // ID更新需要特殊处理
          modeling.updateProperties(element, { id: value })
          break
        default:
          modeling.updateProperties(element, { [property]: value })
      }

      // 标记为有未保存更改
      set({ hasUnsavedChanges: true })
      
      return true
    } catch (error) {
      console.error('Failed to update element property:', error)
      return false
    }
  }
}))
