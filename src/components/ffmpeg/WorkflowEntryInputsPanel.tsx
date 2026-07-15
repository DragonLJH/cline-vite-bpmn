import React from 'react'
import type { MediaInfo } from '../../types/bpmn'
import type { WorkflowTask } from '../../types/bpmn'
import type { EntryInputState } from '../../stores/ffmpegBpmnStore'
import './WorkflowEntryInputsPanel.scss'

export interface WorkflowEntryInputsPanelProps {
  entryTasks: WorkflowTask[]
  entryInputs: Record<string, EntryInputState>
  selectingTaskId?: string | null
  onSelectFile: (taskId: string) => void
  disabled?: boolean
}

function renderMediaSummary(info: MediaInfo | null): string {
  if (!info) return ''
  const parts = [
    info.duration || null,
    info.width && info.height ? `${info.width}x${info.height}` : null,
    info.videoCodec || null
  ].filter(Boolean)
  return parts.join(' · ')
}

const WorkflowEntryInputsPanel: React.FC<WorkflowEntryInputsPanelProps> = ({
  entryTasks,
  entryInputs,
  selectingTaskId = null,
  onSelectFile,
  disabled = false
}) => {
  const filledCount = entryTasks.filter(task => entryInputs[task.id]?.path).length
  const probedCount = entryTasks.filter(task => entryInputs[task.id]?.mediaInfo).length

  if (entryTasks.length === 0) {
    return (
      <div className="workflow-entry-inputs workflow-entry-inputs--empty">
        <p>工作流中没有需要从外部选择文件的入口节点。</p>
      </div>
    )
  }

  return (
    <div className="workflow-entry-inputs">
      {entryTasks.length > 1 && (
        <div className="workflow-entry-inputs__hint">
          请为每个分支起点分别选择输入文件（{filledCount}/{entryTasks.length} 已选择，{probedCount}/{entryTasks.length} 已探测）
        </div>
      )}

      {entryTasks.map((task, index) => {
        const state = entryInputs[task.id] || { path: null, mediaInfo: null, probing: false, error: null }
        const label = task.name || task.id
        const isSelecting = selectingTaskId === task.id
        const statusHint = isSelecting
          ? '选择中…'
          : state.probing
            ? '探测中…'
            : null

        return (
          <div key={task.id} className="workflow-entry-inputs__row">
            <div className="workflow-entry-inputs__label">
              {entryTasks.length > 1 && <span className="workflow-entry-inputs__index">{index + 1}</span>}
              <span className="workflow-entry-inputs__name" title={task.id}>{label}</span>
            </div>
            <input
              type="text"
              className="workflow-entry-inputs__path"
              value={state.path || ''}
              readOnly
              placeholder="选择视频文件..."
            />
            <div className="workflow-entry-inputs__actions">
              <button
                type="button"
                className="workflow-entry-inputs__btn"
                onClick={() => onSelectFile(task.id)}
                disabled={disabled || isSelecting || state.probing}
              >
                {isSelecting ? '选择中...' : state.probing ? '探测中...' : '选择'}
              </button>
            </div>
            {statusHint && (
              <div className="workflow-entry-inputs__meta workflow-entry-inputs__meta--pending">{statusHint}</div>
            )}
            {state.mediaInfo && (
              <div className="workflow-entry-inputs__meta">{renderMediaSummary(state.mediaInfo)}</div>
            )}
            {state.error && (
              <div className="workflow-entry-inputs__error">{state.error}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default WorkflowEntryInputsPanel
