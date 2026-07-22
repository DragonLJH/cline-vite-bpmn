import React, { useRef, useEffect, useState } from 'react'
import FfmpegDesigner from './components/FfmpegDesigner'
import FfmpegPropertiesPanel from './components/FfmpegPropertiesPanel'
import ProcessList from '../bpmn/components/ProcessList'
import Toolbar from '../bpmn/components/Toolbar'
import XmlEditor from '../bpmn/components/XmlEditor'
import NodeListEditor from '../bpmn/components/NodeListEditor'
import ExecutionPanel from '../bpmn/components/ExecutionPanel'
import Icon from '../../components/Icon'
import { BpmnStoreProvider } from '../../contexts/BpmnStoreContext'
import { useFfmpegBpmnStore } from '../../stores/ffmpegBpmnStore'
import { bpmnService } from '../../services/bpmn'
import type { ProcessDefinition } from '../../types/bpmn'
import './index.scss'

type SaveStatus = 'saved' | 'unsaved' | 'saving'
type TabMode = 'designer' | 'xml' | 'nodes' | 'execute'

const FfmpegBpmnPageContent: React.FC = () => {
  const designerRef = useRef<any>(null)
  const [showProcessList, setShowProcessList] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const {
    activeTab,
    setActiveTab,
    bpmnXml,
    setBpmnXml,
    hasUnsavedChanges,
    currentProcessId,
    processList,
    updateProcess,
    setCurrentProcessId,
    clearHistory,
    setSelectedElement,
    setHasUnsavedChanges
  } = useFfmpegBpmnStore()
  const hasCurrentWorkflow = Boolean(
    currentProcessId && processList.some(process => process.id === currentProcessId)
  )

  useEffect(() => {
    setSaveStatus(hasUnsavedChanges ? 'unsaved' : 'saved')
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!hasCurrentWorkflow) {
      setSelectedElement(null)
    }
  }, [hasCurrentWorkflow, setSelectedElement])

  const handleSave = async () => {
    if (!currentProcessId) return

    setSaveStatus('saving')

    try {
      const currentProcess = processList.find(p => p.id === currentProcessId)
      if (currentProcess) {
        const updatedProcess = bpmnService.updateProcessXml(currentProcess, bpmnXml)
        updateProcess(currentProcessId, updatedProcess)
        setHasUnsavedChanges(false)
        setSaveStatus('saved')
      }
    } catch {
      setSaveStatus('unsaved')
    }
  }

  const handleImport = (_xml: string) => {
    console.log('流程已导入')
  }

  const handleExport = async (format: 'bpmn' | 'svg' | 'png') => {
    const currentProcess = processList.find(p => p.id === currentProcessId)
    if (!currentProcess) return

    switch (format) {
      case 'bpmn': {
        const result = await bpmnService.exportProcess(currentProcess, { format: 'bpmn', prettify: true })
        if (result.success && result.data) {
          bpmnService.downloadFile(result.data, `${currentProcess.name}.bpmn`, 'application/xml')
        }
        break
      }
      case 'svg': {
        if (designerRef.current?.getSvg) {
          const svg = await designerRef.current.getSvg()
          if (svg) {
            bpmnService.downloadFile(svg, `${currentProcess.name}.svg`, 'image/svg+xml')
          }
        }
        break
      }
      case 'png':
        alert('PNG导出功能需要额外依赖，请使用SVG格式')
        break
    }
  }

  const handleSelectProcess = (process: ProcessDefinition) => {
    if (currentProcessId === process.id) return

    if (hasUnsavedChanges) {
      const shouldSave = window.confirm(
        `当前流程「${processList.find(p => p.id === currentProcessId)?.name || '未命名'}」有未保存的修改。\n\n点击"确定"保存并切换\n点击"取消"放弃修改并切换`
      )
      if (shouldSave) {
        handleSave()
      }
    }

    setCurrentProcessId(process.id)
    setBpmnXml(process.bpmnXml)
    clearHistory()
    setHasUnsavedChanges(false)
    setSaveStatus('saved')
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault()
            handleSave()
            break
          case 'z':
            if (e.shiftKey) {
              e.preventDefault()
              useFfmpegBpmnStore.getState().redo()
            } else {
              e.preventDefault()
              useFfmpegBpmnStore.getState().undo()
            }
            break
          case 'y':
            e.preventDefault()
            useFfmpegBpmnStore.getState().redo()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saved': return '已保存'
      case 'unsaved': return '有未保存的修改'
      case 'saving': return '保存中...'
      default: return ''
    }
  }

  return (
    <div className="bpmn-page">
      <Toolbar
        className="bpmn-page__toolbar"
        onSave={handleSave}
        onImport={handleImport}
        onExport={handleExport}
        saveStatus={saveStatus}
      />

      <div className="bpmn-page__process-bar">
        <div className="bpmn-page__process-bar-header">
          <div className="bpmn-page__process-bar-title">
            <Icon name="list" size={16} />
            <span>工作流列表</span>
          </div>
          <button
            className="bpmn-page__process-bar-toggle"
            onClick={() => setShowProcessList(!showProcessList)}
            title={showProcessList ? '收起' : '展开'}
          >
            <Icon name={showProcessList ? 'chevron-up' : 'chevron-down'} size={14} />
          </button>
        </div>
        {showProcessList && (
          <ProcessList onSelectProcess={handleSelectProcess} layout="horizontal" />
        )}
      </div>

      <div className="bpmn-page__content">
        <div className="bpmn-page__main">
          <div className="bpmn-page__tabs">
            <button
              className={`bpmn-page__tab ${activeTab === 'designer' ? 'bpmn-page__tab--active' : ''}`}
              onClick={() => setActiveTab('designer')}
            >
              <Icon name="settings" size={14} />
              设计器
            </button>
            <button
              className={`bpmn-page__tab ${activeTab === 'xml' ? 'bpmn-page__tab--active' : ''}`}
              onClick={() => setActiveTab('xml')}
            >
              <Icon name="document" size={14} />
              XML 编辑器
            </button>
            <button
              className={`bpmn-page__tab ${activeTab === 'nodes' ? 'bpmn-page__tab--active' : ''}`}
              onClick={() => setActiveTab('nodes')}
            >
              <Icon name="list" size={14} />
              节点列表
            </button>
            <button
              className={`bpmn-page__tab ${activeTab === 'execute' ? 'bpmn-page__tab--active' : ''}`}
              onClick={() => setActiveTab('execute')}
            >
              <Icon name="clock" size={14} />
              执行
            </button>
          </div>

          <div className="bpmn-page__tab-content">
            {!hasCurrentWorkflow ? (
              <div className="bpmn-page__empty-workflow">
                <Icon name="document" size={48} className="bpmn-page__empty-workflow-icon" />
                <div className="bpmn-page__empty-workflow-title">请先创建或导入工作流</div>
                <div className="bpmn-page__empty-workflow-text">
                  创建工作流后才能使用设计器画布、节点编辑和执行功能。
                </div>
              </div>
            ) : (
              <>
                <div
                  className="bpmn-page__designer-host"
                  style={{ display: activeTab === 'designer' ? 'block' : 'none', height: '100%' }}
                >
                  <FfmpegDesigner ref={designerRef} />
                </div>
                {activeTab === 'xml' && <XmlEditor />}
                {activeTab === 'nodes' && <NodeListEditor />}
                {activeTab === 'execute' && <ExecutionPanel />}
              </>
            )}
          </div>
        </div>

        {hasCurrentWorkflow && showPropertiesPanel && (
          <div className="bpmn-page__sidebar bpmn-page__sidebar--right">
            <div className="bpmn-page__sidebar-header">
              <h3>FFmpeg 属性</h3>
              <button
                className="bpmn-page__sidebar-toggle"
                onClick={() => setShowPropertiesPanel(false)}
                title="收起属性面板"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
            <FfmpegPropertiesPanel />
          </div>
        )}

        {hasCurrentWorkflow && !showPropertiesPanel && (
          <button
            className="bpmn-page__expand-btn bpmn-page__expand-btn--right"
            onClick={() => setShowPropertiesPanel(true)}
            title="展开属性面板"
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </div>

      <div className="bpmn-page__statusbar">
        <div className="bpmn-page__statusbar-left">
          {hasCurrentWorkflow ? (
            <span className="bpmn-page__process-info">
              当前工作流: {processList.find(p => p.id === currentProcessId)?.name || '未命名'}
            </span>
          ) : (
            <span className="bpmn-page__process-info">未选择工作流</span>
          )}
        </div>
        <div className="bpmn-page__statusbar-right">
          <span className={`bpmn-page__save-status bpmn-page__save-status--${saveStatus}`}>
            {saveStatus === 'saved' && <Icon name="check" size={14} color="#166534" />}
            {saveStatus === 'unsaved' && <Icon name="warning" size={14} color="#92400e" />}
            {saveStatus === 'saving' && <Icon name="clock" size={14} color="#1e40af" />}
            {' '}{getSaveStatusText()}
          </span>
          <span className="bpmn-page__version">FFmpeg BPMN</span>
        </div>
      </div>
    </div>
  )
}

const FfmpegBpmnPage: React.FC = () => (
  <BpmnStoreProvider value={useFfmpegBpmnStore}>
    <FfmpegBpmnPageContent />
  </BpmnStoreProvider>
)

export default FfmpegBpmnPage
