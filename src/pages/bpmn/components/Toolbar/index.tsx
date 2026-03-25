import React, { useRef } from 'react'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { bpmnService } from '../../../../services/bpmn'
import type { ToolbarAction } from '../../../../types/bpmn'
import './index.scss'

interface ToolbarProps {
  className?: string
  onSave?: () => void
  onImport?: (xml: string) => void
  onExport?: (format: 'bpmn' | 'svg' | 'png') => void
  saveStatus?: 'saved' | 'unsaved' | 'saving'
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  className, 
  onSave, 
  onImport, 
  onExport,
  saveStatus = 'saved'
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const {
    bpmnXml,
    setBpmnXml,
    zoomLevel,
    setZoomLevel,
    minimapOpen,
    setMinimapOpen,
    undo,
    redo,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    currentProcessId,
    processList,
    updateProcess
  } = useBpmnStore()

  // 处理工具栏操作
  const handleAction = async (action: ToolbarAction) => {
    switch (action) {
      case 'undo':
        undo()
        break
        
      case 'redo':
        redo()
        break
        
      case 'save':
        handleSave()
        break
        
      case 'import':
        fileInputRef.current?.click()
        break
        
      case 'export':
        onExport?.('bpmn')
        break
        
      case 'export-svg':
        onExport?.('svg')
        break
        
      case 'export-png':
        onExport?.('png')
        break
        
      case 'zoom-in':
        setZoomLevel(zoomLevel + 0.1)
        break
        
      case 'zoom-out':
        setZoomLevel(zoomLevel - 0.1)
        break
        
      case 'zoom-reset':
        setZoomLevel(1)
        break
        
      case 'fit-viewport':
        setZoomLevel(1)
        // 这里应该调用bpmn-js的fit-viewport
        break
        
      case 'minimap':
        setMinimapOpen(!minimapOpen)
        break
        
      default:
        break
    }
  }

  // 保存流程
  const handleSave = () => {
    if (currentProcessId) {
      const currentProcess = processList.find(p => p.id === currentProcessId)
      if (currentProcess) {
        const updatedProcess = bpmnService.updateProcessXml(currentProcess, bpmnXml)
        updateProcess(currentProcessId, updatedProcess)
        setHasUnsavedChanges(false)
        onSave?.()
      }
    }
  }

  // 处理文件导入
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = await bpmnService.importFromFile(file)
      if (result.success && result.process) {
        setBpmnXml(result.process.bpmnXml)
        setHasUnsavedChanges(true)
        onImport?.(result.process.bpmnXml)
      } else {
        alert(`导入失败: ${result.errors?.[0]?.message || '未知错误'}`)
      }
    } catch (error) {
      alert('文件读取失败')
    }

    // 清空input值，允许重复导入同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 格式化XML
  const handleFormatXml = () => {
    const formattedXml = bpmnService.formatXml(bpmnXml)
    setBpmnXml(formattedXml)
  }

  // 验证XML
  const handleValidateXml = () => {
    const result = bpmnService.validateXml(bpmnXml)
    if (result.valid) {
      alert('XML格式验证通过！')
    } else {
      alert(`验证失败:\n${result.errors.map(e => e.message).join('\n')}`)
    }
  }

  const zoomPercentage = Math.round(zoomLevel * 100)

  return (
    <div className={`toolbar ${className || ''}`}>
      {/* 左侧：文件操作 */}
      <div className="toolbar__group">
        {/* 只在有未保存修改时显示保存按钮 */}
        {hasUnsavedChanges && (
          <button
            className={`toolbar__btn toolbar__btn--save toolbar__btn--${saveStatus}`}
            onClick={() => handleAction('save')}
            disabled={saveStatus === 'saving'}
            title="保存 (Ctrl+S)"
          >
            {saveStatus === 'saving' ? '⏳ 保存中...' : '💾 保存'}
          </button>
        )}
        
        <button
          className="toolbar__btn"
          onClick={() => handleAction('import')}
          title="导入BPMN文件"
        >
          📂 导入
        </button>
        
        <div className="toolbar__dropdown">
          <button className="toolbar__btn" title="导出">
            📤 导出 ▾
          </button>
          <div className="toolbar__dropdown-menu">
            <button onClick={() => handleAction('export')}>
              📄 导出BPMN
            </button>
            <button onClick={() => handleAction('export-svg')}>
              🖼️ 导出SVG
            </button>
            <button onClick={() => handleAction('export-png')}>
              📷 导出PNG
            </button>
          </div>
        </div>
      </div>

      {/* 中间：编辑操作 */}
      <div className="toolbar__group">
        <button
          className="toolbar__btn toolbar__btn--icon"
          onClick={() => handleAction('undo')}
          disabled={!canUndo()}
          title="撤销 (Ctrl+Z)"
        >
          ↩️
        </button>
        
        <button
          className="toolbar__btn toolbar__btn--icon"
          onClick={() => handleAction('redo')}
          disabled={!canRedo()}
          title="重做 (Ctrl+Y)"
        >
          ↪️
        </button>
        
        <div className="toolbar__separator" />
        
        <button
          className="toolbar__btn toolbar__btn--small"
          onClick={handleFormatXml}
          title="格式化XML"
        >
          🎨 格式化
        </button>
        
        <button
          className="toolbar__btn toolbar__btn--small"
          onClick={handleValidateXml}
          title="验证XML格式"
        >
          ✅ 验证
        </button>
      </div>

      {/* 右侧：视图控制 */}
      <div className="toolbar__group">
        <div className="toolbar__zoom">
          <button
            className="toolbar__btn toolbar__btn--icon"
            onClick={() => handleAction('zoom-out')}
            disabled={zoomLevel <= 0.2}
            title="缩小"
          >
            ➖
          </button>
          
          <span className="toolbar__zoom-level">
            {zoomPercentage}%
          </span>
          
          <button
            className="toolbar__btn toolbar__btn--icon"
            onClick={() => handleAction('zoom-in')}
            disabled={zoomLevel >= 4}
            title="放大"
          >
            ➕
          </button>
          
          <button
            className="toolbar__btn toolbar__btn--small"
            onClick={() => handleAction('fit-viewport')}
            title="适应视图"
          >
            🎯 适应
          </button>
        </div>
        
        <div className="toolbar__separator" />
        
        <button
          className={`toolbar__btn toolbar__btn--icon ${minimapOpen ? 'active' : ''}`}
          onClick={() => handleAction('minimap')}
          title="迷你地图"
        >
          🗺️
        </button>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".bpmn,.xml"
        onChange={handleFileImport}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default Toolbar