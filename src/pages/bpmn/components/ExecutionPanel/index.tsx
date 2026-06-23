import React, { useState, useMemo, useCallback } from 'react'
import { usePageBpmnStore, usePageBpmnStoreHook } from '../../../../contexts/BpmnStoreContext'
import { parseWorkflowGraph } from '../../../../utils/bpmnParser'
import { runWorkflow, getWorkflowSummary, FFMPEG_OPERATION_LABELS } from '../../../../services/ffmpeg'
import type { WorkflowStepResult } from '../../../../services/ffmpeg'
import type { FfmpegJobConfig, MediaInfo } from '../../../../types/bpmn'
import Icon from '../../../../components/Icon'
import './index.scss'

interface ExecutionPanelProps {
  className?: string
}

type PreviewStoreSlice = {
  previewContext?: {
    inputPath: string | null
    mediaInfo: MediaInfo | null
  }
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

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ className }) => {
  const useStore = usePageBpmnStoreHook()
  const { bpmnXml } = usePageBpmnStore()
  const storeSlice = useStore() as PreviewStoreSlice
  const hasPreviewStore = Boolean(storeSlice.setInputPath)

  const [localInputPath, setLocalInputPath] = useState('')
  const [localMediaInfo, setLocalMediaInfo] = useState<MediaInfo | null>(null)
  const [probing, setProbing] = useState(false)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<WorkflowStepResult[]>([])
  const [runError, setRunError] = useState<string | null>(null)

  const inputPath = hasPreviewStore
    ? (storeSlice.previewContext?.inputPath || '')
    : localInputPath
  const mediaInfo = hasPreviewStore
    ? (storeSlice.previewContext?.mediaInfo || null)
    : localMediaInfo

  const workflowGraph = useMemo(() => parseWorkflowGraph(bpmnXml), [bpmnXml])
  const workflowSummary = useMemo(() => getWorkflowSummary(workflowGraph), [workflowGraph])

  const handleSelectInput = useCallback(async () => {
    if (!window.electronAPI) {
      setRunError('请在 Electron 环境中运行')
      return
    }

    const paths = await window.electronAPI.openFileDialog({
      title: '选择输入视频',
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (paths && paths.length > 0) {
      const selectedPath = paths[0]
      if (hasPreviewStore) {
        const state = useStore.getState()
        state.setInputPath?.(selectedPath)
        state.setMediaInfo?.(null)
        setRunError(null)
        if (window.electronAPI?.ffmpeg?.probe) {
          setProbing(true)
          try {
            const result = await window.electronAPI.ffmpeg.probe({ inputPath: selectedPath })
            if (result.success && result.info) {
              state.setMediaInfo?.(result.info)
              await state.refreshPreview?.(0)
            } else {
              setRunError(result.error || '探测失败')
            }
          } catch (error) {
            setRunError((error as Error).message)
          } finally {
            setProbing(false)
          }
        }
      } else {
        setLocalInputPath(selectedPath)
        setLocalMediaInfo(null)
        setRunError(null)
      }
    }
  }, [hasPreviewStore, useStore])

  const handleProbeInput = useCallback(async () => {
    if (!inputPath || !window.electronAPI?.ffmpeg) return

    setProbing(true)
    setRunError(null)

    try {
      const result = await window.electronAPI.ffmpeg.probe({ inputPath })
      console.log('[ExecutionPanel] 探测命令: ffmpeg -hide_banner -i', inputPath)
      console.log('[ExecutionPanel] 探测结果:', result)
      if (result.success && result.info) {
        if (hasPreviewStore) {
          const state = useStore.getState()
          state.setMediaInfo?.(result.info)
          await state.refreshPreview?.(0)
        } else {
          setLocalMediaInfo(result.info)
        }
      } else {
        setRunError(result.error || '探测失败')
        if (hasPreviewStore) {
          useStore.getState().setMediaInfo?.(null)
        } else {
          setLocalMediaInfo(null)
        }
      }
    } catch (error) {
      setRunError((error as Error).message)
    } finally {
      setProbing(false)
    }
  }, [inputPath, hasPreviewStore, useStore])

  const handleRunWorkflow = useCallback(async () => {
    if (!inputPath) {
      setRunError('请先选择输入文件')
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
      const result = await runWorkflow(xmlToRun, inputPath, (step) => {
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
  }, [bpmnXml, inputPath, useStore])

  const renderMediaInfo = () => {
    if (!mediaInfo) return null

    const items = [
      { label: '时长', value: mediaInfo.duration || '-' },
      { label: '分辨率', value: mediaInfo.width && mediaInfo.height ? `${mediaInfo.width}x${mediaInfo.height}` : '-' },
      { label: '帧率', value: mediaInfo.fps ? `${mediaInfo.fps} fps` : '-' },
      { label: '视频编码', value: mediaInfo.videoCodec || '-' },
      { label: '音频编码', value: mediaInfo.audioCodec || '-' },
      { label: '码率', value: mediaInfo.bitrate || '-' }
    ]

    return (
      <div className="execution-panel__info-grid">
        {items.map(item => (
          <div key={item.label} className="execution-panel__info-item">
            <div className="execution-panel__info-label">{item.label}</div>
            <div className="execution-panel__info-value">{item.value}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`execution-panel ${className || ''}`}>
      <div className="execution-panel__section">
        <h3 className="execution-panel__title">输入文件</h3>
        <div className="execution-panel__row">
          <input
            type="text"
            className="execution-panel__input"
            value={inputPath}
            readOnly
            placeholder="选择视频文件..."
          />
          <button
            className="execution-panel__btn execution-panel__btn--secondary"
            onClick={handleSelectInput}
          >
            选择文件
          </button>
          <button
            className="execution-panel__btn execution-panel__btn--secondary"
            onClick={handleProbeInput}
            disabled={!inputPath || probing}
          >
            {probing ? '探测中...' : '探测信息'}
          </button>
        </div>
        {renderMediaInfo()}
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
            disabled={!inputPath || running || !workflowGraph?.executionOrder.length}
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
              <p>选择输入文件后点击「运行工作流」</p>
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
