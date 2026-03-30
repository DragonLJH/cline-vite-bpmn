import React, { useRef, useEffect, useState } from 'react'
import BpmnDesigner from './components/BpmnDesigner'
import ProcessList from './components/ProcessList'
import PropertiesPanel from './components/PropertiesPanel'
import Toolbar from './components/Toolbar'
import Icon from '../../components/Icon'
import { useBpmnStore } from '../../stores/bpmnStore'
import { bpmnService } from '../../services/bpmn'
import type { ProcessDefinition } from '../../types/bpmn'
import './index.scss'

// 保存状态枚举
type SaveStatus = 'saved' | 'unsaved' | 'saving'

const BpmnPage: React.FC = () => {
  const designerRef = useRef<any>(null)
  const [showProcessList, setShowProcessList] = useState(true)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [pendingProcess, setPendingProcess] = useState<ProcessDefinition | null>(null)

  const {
    bpmnXml,
    setBpmnXml,
    hasUnsavedChanges,
    currentProcessId,
    processList,
    addProcess,
    updateProcess,
    setCurrentProcessId,
    clearHistory,
    setHasUnsavedChanges
  } = useBpmnStore()

  // 初始化时创建默认流程
  useEffect(() => {
    if (processList.length === 0) {
      const defaultProcess = bpmnService.createProcess('新建流程', '流程描述')
      addProcess(defaultProcess)
      setCurrentProcessId(defaultProcess.id)
      setBpmnXml(defaultProcess.bpmnXml)
      clearHistory()
      setHasUnsavedChanges(false)
      setSaveStatus('saved')
    }
  }, [])

  // 监听未保存状态变化
  useEffect(() => {
    if (hasUnsavedChanges) {
      setSaveStatus('unsaved')
    } else {
      setSaveStatus('saved')
    }
  }, [hasUnsavedChanges])

  // 保存流程
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
        console.log('流程已保存')
      }
    } catch (error) {
      console.error('保存失败:', error)
      setSaveStatus('unsaved')
    }
  }

  // 导入流程
  const handleImport = (xml: string) => {
    console.log('流程已导入')
  }

  // 导出流程
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
      case 'png': {
        // PNG导出需要使用html2canvas等库，这里简化处理
        alert('PNG导出功能需要额外依赖，请使用SVG格式')
        break
      }
    }
  }

  // 选择流程
  const handleSelectProcess = (process: ProcessDefinition) => {
    if (currentProcessId === process.id) return

    if (hasUnsavedChanges) {
      setPendingProcess(process)
      // 显示保存确认对话框
      const shouldSave = window.confirm(
        `当前流程「${processList.find(p => p.id === currentProcessId)?.name || '未命名'}」有未保存的修改。\n\n点击"确定"保存并切换\n点击"取消"放弃修改并切换`
      )

      if (shouldSave) {
        handleSave()
      }

      setPendingProcess(null)
    }

    setCurrentProcessId(process.id)
    setBpmnXml(process.bpmnXml)
    clearHistory()
    setHasUnsavedChanges(false)
    setSaveStatus('saved')
  }

  // 键盘快捷键
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
              useBpmnStore.getState().redo()
            } else {
              e.preventDefault()
              useBpmnStore.getState().undo()
            }
            break
          case 'y':
            e.preventDefault()
            useBpmnStore.getState().redo()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 获取保存状态显示文本
  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saved':
        return '已保存'
      case 'unsaved':
        return '有未保存的修改'
      case 'saving':
        return '保存中...'
      default:
        return ''
    }
  }


  return (
    <div className="bpmn-page">
      {/* 工具栏 */}
      <Toolbar
        className="bpmn-page__toolbar"
        onSave={handleSave}
        onImport={handleImport}
        onExport={handleExport}
        saveStatus={saveStatus}
      />

      {/* 流程列表横向区域 */}
      <div className="bpmn-page__process-bar">
        <div className="bpmn-page__process-bar-header">
          <div className="bpmn-page__process-bar-title">
            <Icon name="list" size={16} />
            <span>流程列表</span>
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
          <ProcessList
            onSelectProcess={handleSelectProcess}
            layout="horizontal"
          />
        )}
      </div>

      <div className="bpmn-page__content">
        {/* BPMN设计器主体 */}
        <div className="bpmn-page__main">
          <BpmnDesigner ref={designerRef} />
        </div>

        {/* 属性面板侧边栏 */}
        {showPropertiesPanel && (
          <div className="bpmn-page__sidebar bpmn-page__sidebar--right">
            <div className="bpmn-page__sidebar-header">
              <h3>属性面板</h3>
              <button
                className="bpmn-page__sidebar-toggle"
                onClick={() => setShowPropertiesPanel(false)}
                title="收起属性面板"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
            <PropertiesPanel />
          </div>
        )}

        {/* 属性面板收起时的展开按钮 */}
        {!showPropertiesPanel && (
          <button
            className="bpmn-page__expand-btn bpmn-page__expand-btn--right"
            onClick={() => setShowPropertiesPanel(true)}
            title="展开属性面板"
          >
            <Icon name="settings" size={18} />
          </button>
        )}
      </div>

      {/* 状态栏 */}
      <div className="bpmn-page__statusbar">
        <div className="bpmn-page__statusbar-left">
          {currentProcessId && (
            <span className="bpmn-page__process-info">
              当前流程: {processList.find(p => p.id === currentProcessId)?.name || '未命名'}
            </span>
          )}
        </div>
        <div className="bpmn-page__statusbar-right">
          <span className={`bpmn-page__save-status bpmn-page__save-status--${saveStatus}`}>
            {saveStatus === 'saved' && <Icon name="check" size={14} color="#166534" />}
            {saveStatus === 'unsaved' && <Icon name="warning" size={14} color="#92400e" />}
            {saveStatus === 'saving' && <Icon name="clock" size={14} color="#1e40af" />}
            {' '}{getSaveStatusText()}
          </span>
          <span className="bpmn-page__version">
            BPMN 2.0
          </span>
        </div>
      </div>
    </div>
  )
}

export default BpmnPage