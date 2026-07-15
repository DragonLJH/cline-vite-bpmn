import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { usePageBpmnStore, usePageBpmnStoreHook } from '../../../../contexts/BpmnStoreContext'
import { parseWorkflowGraph } from '../../../../utils/bpmnParser'
import { runWorkflow, getWorkflowSummary, FFMPEG_OPERATION_LABELS } from '../../../../services/ffmpeg'
import { collectEntryInputTasks } from '../../../../shared/ffmpeg/mergeInputs'
import type { WorkflowStepResult, WorkflowEntryPayload } from '../../../../services/ffmpeg/workflowRunner'
import type { FfmpegJobConfig, MediaInfo } from '../../../../types/bpmn'
import type { EntryInputState } from '../../../../stores/ffmpegBpmnStore'
import { DEFAULT_ENTRY_INPUT_STATE } from '../../../../stores/ffmpegBpmnStore'
import WorkflowEntryInputsPanel from '../../../../components/ffmpeg/WorkflowEntryInputsPanel'
import Icon from '../../../../components/Icon'
import './index.scss'

interface ExecutionPanelProps {
  className?: string
}

type PreviewStoreSlice = {
  previewContext?: {
    inputPath: string | null
    mediaInfo: MediaInfo | null
    entryInputs?: Record<string, EntryInputState>
  }
  reconcileEntryInputs?: (entryTaskIds: string[]) => void
  setEntryInputPath?: (taskId: string, path: string | null) => void
  setEntryMediaInfo?: (taskId: string, info: MediaInfo | null) => void
  setEntryProbing?: (taskId: string, probing: boolean) => void
  setEntryInputError?: (taskId: string, error: string | null) => void
  getEntryInputsForRun?: () => Record<string, WorkflowEntryPayload>
  setInputPath?: (path: string | null) => void
  setMediaInfo?: (info: MediaInfo | null) => void
  refreshPreview?: (timeSeconds?: number) => Promise<void>
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待',
  running: '运行中',
  success: '成功',
  failed: '失败',
  skipped: '跳过'
}

function reconcileLocalEntryInputs(
  prev: Record<string, EntryInputState>,
  entryTaskIds: string[]
): Record<string, EntryInputState> {
  const next: Record<string, EntryInputState> = {}
  entryTaskIds.forEach(taskId => {
    next[taskId] = prev[taskId] || { ...DEFAULT_ENTRY_INPUT_STATE }
  })
  return next
}

function isEntryReady(state: EntryInputState | undefined): boolean {
  return Boolean(state?.path && state.mediaInfo && !state.probing && !state.error)
}

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ className }) => {
  const useStore = usePageBpmnStoreHook()
  const { bpmnXml } = usePageBpmnStore()
  const storeSlice = useStore() as PreviewStoreSlice
  const hasPreviewStore = Boolean(storeSlice.reconcileEntryInputs)

  const [localEntryInputs, setLocalEntryInputs] = useState<Record<string, EntryInputState>>({})
  const [selectingTaskId, setSelectingTaskId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<WorkflowStepResult[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const probeEntryRef = useRef<(taskId: string, pathOverride?: string) => Promise<boolean>>(async () => false)

  const workflowGraph = useMemo(() => parseWorkflowGraph(bpmnXml), [bpmnXml])
  const entryTasks = useMemo(
    () => (workflowGraph ? collectEntryInputTasks(workflowGraph) : []),
    [workflowGraph]
  )
  const workflowSummary = useMemo(() => getWorkflowSummary(workflowGraph), [workflowGraph])

  const entryInputs = hasPreviewStore
    ? (storeSlice.previewContext?.entryInputs || {})
    : localEntryInputs

  useEffect(() => {
    const taskIds = entryTasks.map(task => task.id)
    if (hasPreviewStore) {
      storeSlice.reconcileEntryInputs?.(taskIds)
    } else {
      setLocalEntryInputs(prev => reconcileLocalEntryInputs(prev, taskIds))
    }
  }, [entryTasks, hasPreviewStore, storeSlice.reconcileEntryInputs])

  const allEntryInputsReady = entryTasks.length > 0
    && entryTasks.every(task => isEntryReady(entryInputs[task.id]))

  const anyEntryProbing = entryTasks.some(task => {
    const state = entryInputs[task.id]
    return Boolean(state?.probing || selectingTaskId === task.id)
  })

  const resolveEntryInputsForRun = useCallback((): Record<string, WorkflowEntryPayload> | null => {
    if (entryTasks.length === 0) return null

    if (hasPreviewStore && storeSlice.getEntryInputsForRun) {
      return storeSlice.getEntryInputsForRun()
    }

    const result: Record<string, WorkflowEntryPayload> = {}
    entryTasks.forEach(task => {
      const state = localEntryInputs[task.id]
      if (state?.path) {
        result[task.id] = {
          path: state.path,
          mediaInfo: state.mediaInfo ?? undefined
        }
      }
    })
    return result
  }, [entryTasks, hasPreviewStore, localEntryInputs, storeSlice.getEntryInputsForRun])

  const handleProbeEntry = useCallback(async (taskId: string, pathOverride?: string): Promise<boolean> => {
    const path = pathOverride || entryInputs[taskId]?.path
    if (!path || !window.electronAPI?.ffmpeg) return false

    if (hasPreviewStore) {
      useStore.getState().setEntryProbing?.(taskId, true)
    } else {
      setLocalEntryInputs(prev => ({
        ...prev,
        [taskId]: { ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE), probing: true, error: null }
      }))
    }

    try {
      const result = await window.electronAPI.ffmpeg.probe({ inputPath: path })
      if (result.success && result.info) {
        if (hasPreviewStore) {
          const state = useStore.getState() as PreviewStoreSlice
          state.setEntryMediaInfo?.(taskId, result.info)
          state.setEntryInputError?.(taskId, null)
          if (entryTasks.length === 1) {
            await state.refreshPreview?.(0)
          }
        } else {
          setLocalEntryInputs(prev => ({
            ...prev,
            [taskId]: {
              ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE),
              mediaInfo: result.info || null,
              probing: false,
              error: null
            }
          }))
        }
        return true
      }

      const message = result.error || '探测失败'
      if (hasPreviewStore) {
        useStore.getState().setEntryMediaInfo?.(taskId, null)
        useStore.getState().setEntryInputError?.(taskId, message)
      } else {
        setLocalEntryInputs(prev => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE),
            mediaInfo: null,
            probing: false,
            error: message
          }
        }))
      }
      return false
    } catch (error) {
      const message = (error as Error).message
      if (hasPreviewStore) {
        useStore.getState().setEntryInputError?.(taskId, message)
      } else {
        setLocalEntryInputs(prev => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE),
            probing: false,
            error: message
          }
        }))
      }
      return false
    } finally {
      if (hasPreviewStore) {
        useStore.getState().setEntryProbing?.(taskId, false)
      } else {
        setLocalEntryInputs(prev => ({
          ...prev,
          [taskId]: { ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE), probing: false }
        }))
      }
    }
  }, [entryInputs, entryTasks.length, hasPreviewStore, useStore])

  probeEntryRef.current = handleProbeEntry

  const handleSelectEntryFile = useCallback(async (taskId: string) => {
    if (!window.electronAPI) {
      setRunError('请在 Electron 环境中运行')
      return
    }

    const task = entryTasks.find(item => item.id === taskId)
    setSelectingTaskId(taskId)
    setRunError(null)

    try {
      const paths = await window.electronAPI.openFileDialog({
        title: `选择输入视频 - ${task?.name || taskId}`,
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (!paths || paths.length === 0) return

      const selectedPath = paths[0]
      if (hasPreviewStore) {
        const state = useStore.getState() as PreviewStoreSlice
        state.setEntryInputPath?.(taskId, selectedPath)
        state.setEntryMediaInfo?.(taskId, null)
        state.setEntryInputError?.(taskId, null)
      } else {
        setLocalEntryInputs(prev => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || DEFAULT_ENTRY_INPUT_STATE),
            path: selectedPath,
            mediaInfo: null,
            error: null
          }
        }))
      }

      const probeOk = await probeEntryRef.current(taskId, selectedPath)
      if (!probeOk) {
        const label = task?.name || taskId
        setRunError(`「${label}」探测失败，请重新选择文件或检查文件是否有效`)
      }
    } finally {
      setSelectingTaskId(null)
    }
  }, [entryTasks, hasPreviewStore, useStore])

  const validateBeforeRun = useCallback((): string | null => {
    const probing = entryTasks.find(task => {
      const state = entryInputs[task.id]
      return state?.probing || selectingTaskId === task.id
    })
    if (probing) {
      return '正在探测媒体信息，请稍候…'
    }

    const missingFile = entryTasks.filter(task => !entryInputs[task.id]?.path)
    if (missingFile.length > 0) {
      return `以下入口尚未选择文件：${missingFile.map(task => task.name || task.id).join('、')}`
    }

    const probeFailed = entryTasks.filter(task => {
      const state = entryInputs[task.id]
      return state?.path && (!state.mediaInfo || state.error)
    })
    if (probeFailed.length > 0) {
      const details = probeFailed.map(task => {
        const state = entryInputs[task.id]
        const label = task.name || task.id
        return `「${label}」${state?.error || '探测未完成'}`
      }).join('；')
      return `无法运行工作流：${details}`
    }

    return null
  }, [entryInputs, entryTasks, selectingTaskId])

  const handleRunWorkflow = useCallback(async () => {
    const validationError = validateBeforeRun()
    if (validationError) {
      setRunError(validationError)
      return
    }

    const entryInputsForRun = resolveEntryInputsForRun()
    if (!entryInputsForRun) {
      setRunError('工作流中没有可执行的入口节点')
      return
    }

    const missingMedia = entryTasks.filter(task => !entryInputsForRun[task.id]?.mediaInfo)
    if (missingMedia.length > 0) {
      setRunError(`以下入口尚未完成探测：${missingMedia.map(task => task.name || task.id).join('、')}`)
      return
    }

    setRunning(true)
    setRunError(null)
    setSteps([])

    try {
      let xmlToRun = bpmnXml
      const storeState = useStore.getState() as {
        modelerRef?: { saveXML: (options: { format: boolean }) => Promise<{ xml?: string }> }
        setBpmnXml?: (xml: string) => void
        setBpmnXmlFromModeler?: (xml: string) => void
        getPendingFfmpegConfigs?: () => Record<string, FfmpegJobConfig>
      }
      const { modelerRef, setBpmnXml, setBpmnXmlFromModeler, getPendingFfmpegConfigs } = storeState
      if (modelerRef) {
        try {
          const { xml } = await modelerRef.saveXML({ format: true })
          if (xml) {
            xmlToRun = xml
            if (setBpmnXmlFromModeler) {
              setBpmnXmlFromModeler(xml)
            } else {
              setBpmnXml?.(xml)
            }
          }
        } catch {
          // 使用 store 中已有 XML
        }
      }

      const pendingConfigs = getPendingFfmpegConfigs?.()
      const result = await runWorkflow(xmlToRun, entryInputsForRun, (step) => {
        setSteps(prev => {
          const index = prev.findIndex(s => s.stepId === step.stepId)
          if (index >= 0) {
            const next = [...prev]
            next[index] = step
            return next
          }
          return [...prev, step]
        })
      }, {
        modeler: modelerRef,
        pendingConfigs: pendingConfigs && Object.keys(pendingConfigs).length > 0
          ? pendingConfigs
          : undefined
      })

      if (!result.success) {
        setRunError(result.error || '工作流执行失败')
      }
    } catch (error) {
      setRunError((error as Error).message)
    } finally {
      setRunning(false)
    }
  }, [bpmnXml, entryTasks, resolveEntryInputsForRun, useStore, validateBeforeRun])

  return (
    <div className={`execution-panel ${className || ''}`}>
      <div className="execution-panel__section">
        <h3 className="execution-panel__title">
          输入文件{entryTasks.length > 1 ? `（${entryTasks.length} 个入口）` : ''}
        </h3>
        <WorkflowEntryInputsPanel
          entryTasks={entryTasks}
          entryInputs={entryInputs}
          selectingTaskId={selectingTaskId}
          onSelectFile={handleSelectEntryFile}
          disabled={running}
        />
        {runError && !running && steps.length === 0 && (
          <div className="execution-panel__error">{runError}</div>
        )}
      </div>

      <div className="execution-panel__section">
        <h3 className="execution-panel__title">工作流执行</h3>
        <p className="execution-panel__summary">{workflowSummary}</p>
        <div className="execution-panel__row">
          <button
            className="execution-panel__btn execution-panel__btn--primary"
            onClick={handleRunWorkflow}
            disabled={!allEntryInputsReady || anyEntryProbing || running || !workflowGraph?.executionOrder.length}
          >
            {running ? '执行中...' : '运行工作流'}
          </button>
        </div>

        {steps.length > 0 ? (
          <div className="execution-panel__steps">
            {steps.map(step => (
              <div
                key={step.stepId}
                className={`execution-panel__step execution-panel__step--${step.status}`}
              >
                <div className="execution-panel__step-header">
                  <span className="execution-panel__step-name">
                    {step.name || step.stepId}
                    <span style={{ marginLeft: 8, color: '#6b7280', fontWeight: 400 }}>
                      ({FFMPEG_OPERATION_LABELS[step.operation]})
                    </span>
                  </span>
                  <span className={`execution-panel__step-status execution-panel__step-status--${step.status}`}>
                    {step.status === 'running' && step.progressPercent != null
                      ? `${STATUS_LABELS[step.status]} ${step.progressPercent}%`
                      : STATUS_LABELS[step.status] || step.status}
                  </span>
                </div>
                <div className="execution-panel__step-body">
                  {step.command && (
                    <div className="execution-panel__command-block">
                      <div className="execution-panel__log-label">FFmpeg 命令</div>
                      <pre className="execution-panel__log execution-panel__log--command">{step.command}</pre>
                    </div>
                  )}
                  {step.inputPath && <div>输入: {step.inputPath}</div>}
                  {step.outputPath && <div>输出: {step.outputPath}</div>}
                  {step.exitCode != null && (
                    <div>退出码: {step.exitCode}</div>
                  )}
                  {step.mediaInfo?.duration && <div>时长: {step.mediaInfo.duration}</div>}
                  {step.error && <div className="execution-panel__error">{step.error}</div>}
                  {step.stdout && (
                    <div className="execution-panel__command-block">
                      <div className="execution-panel__log-label">标准输出</div>
                      <pre className="execution-panel__log">{step.stdout.slice(-500)}</pre>
                    </div>
                  )}
                  {step.stderr && (
                    <div className="execution-panel__command-block">
                      <div className="execution-panel__log-label">执行输出</div>
                      <pre className="execution-panel__log">{step.stderr.slice(-800)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          !running && (
            <div className="execution-panel__empty">
              <Icon name="clock" size={24} />
              <p>
                {entryTasks.length > 1
                  ? '为每个入口选择文件（将自动探测），全部成功后点击「运行工作流」'
                  : '选择输入文件（将自动探测）后点击「运行工作流」'}
              </p>
            </div>
          )
        )}

        {runError && steps.length > 0 && (
          <div className="execution-panel__error">{runError}</div>
        )}
      </div>
    </div>
  )
}

export default ExecutionPanel
