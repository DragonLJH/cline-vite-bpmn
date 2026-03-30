import React, { useState } from 'react'
import Icon from '../../../../components/Icon'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { bpmnService } from '../../../../services/bpmn'
import type { ProcessDefinition } from '../../../../types/bpmn'
import './index.scss'

interface ProcessListProps {
  className?: string
  onSelectProcess?: (process: ProcessDefinition) => void
  layout?: 'vertical' | 'horizontal'
}

const ProcessList: React.FC<ProcessListProps> = ({ className, onSelectProcess, layout = 'vertical' }) => {
  const {
    processList,
    currentProcessId,
    setCurrentProcessId,
    addProcess,
    updateProcess,
    deleteProcess,
    setBpmnXml,
    clearHistory,
    setHasUnsavedChanges
  } = useBpmnStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProcessName, setNewProcessName] = useState('')
  const [newProcessDescription, setNewProcessDescription] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // 过滤流程列表
  const filteredProcessList = processList.filter(process =>
    process.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (process.description && process.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // 创建新流程
  const handleCreateProcess = () => {
    if (!newProcessName.trim()) return

    const newProcess = bpmnService.createProcess(
      newProcessName.trim(),
      newProcessDescription.trim() || undefined
    )

    addProcess(newProcess)
    setCurrentProcessId(newProcess.id)
    setBpmnXml(newProcess.bpmnXml)
    clearHistory()
    setHasUnsavedChanges(false)

    // 通知父组件
    onSelectProcess?.(newProcess)

    // 重置表单
    setNewProcessName('')
    setNewProcessDescription('')
    setShowCreateModal(false)
  }

  // 选择流程
  const handleSelectProcess = (process: ProcessDefinition) => {
    if (currentProcessId === process.id) return

    setCurrentProcessId(process.id)
    setBpmnXml(process.bpmnXml)
    clearHistory()
    setHasUnsavedChanges(false)

    // 通知父组件
    onSelectProcess?.(process)
  }

  // 复制流程
  const handleDuplicateProcess = (process: ProcessDefinition, e: React.MouseEvent) => {
    e.stopPropagation()

    const duplicated = bpmnService.duplicateProcess(process)
    addProcess(duplicated)
    setCurrentProcessId(duplicated.id)
    setBpmnXml(duplicated.bpmnXml)
    clearHistory()
    setHasUnsavedChanges(false)

    // 通知父组件
    onSelectProcess?.(duplicated)
  }

  // 删除流程
  const handleDeleteProcess = (id: string) => {
    deleteProcess(id)
    setShowDeleteConfirm(null)

    // 如果删除的是当前流程，清空画布
    if (currentProcessId === id) {
      const defaultXml = bpmnService.createProcess('新流程').bpmnXml
      setBpmnXml(defaultXml)
      clearHistory()
      setHasUnsavedChanges(false)
    }
  }

  // 格式化时间
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className={`process-list process-list--${layout} ${className || ''}`}>
      {/* 头部 */}
      <div className="process-list__header">
        <h3 className="process-list__title">流程列表</h3>
        <button
          className="process-list__create-btn"
          onClick={() => setShowCreateModal(true)}
          title="创建新流程"
        >
          <Icon name="plus" size={18} color="white" />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="process-list__search">
        <input
          type="text"
          className="process-list__search-input"
          placeholder="搜索流程..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            className="process-list__search-clear"
            onClick={() => setSearchTerm('')}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {/* 流程列表 */}
      <div className="process-list__items">
        {filteredProcessList.length === 0 ? (
          <div className="process-list__empty">
            {searchTerm ? (
              <>
                <Icon name="search" size={48} className="process-list__empty-icon" />
                <span className="process-list__empty-text">未找到匹配的流程</span>
              </>
            ) : (
              <>
                <Icon name="document" size={48} className="process-list__empty-icon" />
                <span className="process-list__empty-text">暂无流程</span>
                <button
                  className="process-list__empty-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  创建第一个流程
                </button>
              </>
            )}
          </div>
        ) : (
          filteredProcessList.map(process => (
            <div
              key={process.id}
              className={`process-list__item ${currentProcessId === process.id ? 'active' : ''}`}
              onClick={() => handleSelectProcess(process)}
            >
              <div className="process-list__item-main">
                <div className="process-list__item-name">{process.name}</div>
                {process.description && (
                  <div className="process-list__item-desc">{process.description}</div>
                )}
                <div className="process-list__item-meta">
                  <span className="process-list__item-version">v{process.version}</span>
                  <span className="process-list__item-date">
                    {formatDate(process.updatedAt)}
                  </span>
                </div>
              </div>

              <div className="process-list__item-actions">
                <button
                  className="process-list__action-btn"
                  onClick={(e) => handleDuplicateProcess(process, e)}
                  title="复制流程"
                >
                  <Icon name="copy" size={14} />
                </button>
                <button
                  className="process-list__action-btn process-list__action-btn--delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteConfirm(process.id)
                  }}
                  title="删除流程"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部统计 */}
      <div className="process-list__footer">
        <span className="process-list__count">
          共 {processList.length} 个流程
        </span>
      </div>

      {/* 创建流程弹窗 */}
      {showCreateModal && (
        <div className="process-list__modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="process-list__modal" onClick={(e) => e.stopPropagation()}>
            <div className="process-list__modal-header">
              <h4 className="process-list__modal-title">创建新流程</h4>
              <button
                className="process-list__modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>

            <div className="process-list__modal-body">
              <div className="process-list__form-group">
                <label className="process-list__form-label">流程名称 *</label>
                <input
                  type="text"
                  className="process-list__form-input"
                  placeholder="请输入流程名称"
                  value={newProcessName}
                  onChange={(e) => setNewProcessName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="process-list__form-group">
                <label className="process-list__form-label">流程描述</label>
                <textarea
                  className="process-list__form-textarea"
                  placeholder="请输入流程描述（可选）"
                  value={newProcessDescription}
                  onChange={(e) => setNewProcessDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="process-list__modal-footer">
              <button
                className="process-list__modal-btn process-list__modal-btn--cancel"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                className="process-list__modal-btn process-list__modal-btn--confirm"
                onClick={handleCreateProcess}
                disabled={!newProcessName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="process-list__modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="process-list__modal process-list__modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="process-list__modal-header">
              <h4 className="process-list__modal-title">确认删除</h4>
            </div>

            <div className="process-list__modal-body">
              <p className="process-list__confirm-text">
                确定要删除流程「{processList.find(p => p.id === showDeleteConfirm)?.name}」吗？
              </p>
              <p className="process-list__confirm-warning">
                此操作不可撤销。
              </p>
            </div>

            <div className="process-list__modal-footer">
              <button
                className="process-list__modal-btn process-list__modal-btn--cancel"
                onClick={() => setShowDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                className="process-list__modal-btn process-list__modal-btn--danger"
                onClick={() => handleDeleteProcess(showDeleteConfirm)}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessList