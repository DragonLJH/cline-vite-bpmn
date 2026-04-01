import React, { useState, useEffect, useCallback } from 'react'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { formatXml, validateXml } from '../../../../utils/bpmnParser'
import Icon from '../../../../components/Icon'
import './index.scss'

const XmlEditor: React.FC = () => {
  const { bpmnXml, setBpmnXml, setHasUnsavedChanges } = useBpmnStore()
  const [localXml, setLocalXml] = useState(bpmnXml)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string }>({ valid: true })
  const [isFormatting, setIsFormatting] = useState(false)

  // 同步外部 XML 变化
  useEffect(() => {
    setLocalXml(bpmnXml)
  }, [bpmnXml])

  // 验证 XML
  const validateXmlContent = useCallback((xml: string) => {
    const result = validateXml(xml)
    setValidationResult(result)
    return result.valid
  }, [])

  // 处理 XML 变化
  const handleXmlChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newXml = e.target.value
    setLocalXml(newXml)
    
    // 验证 XML
    const isValid = validateXmlContent(newXml)
    
    // 只有当 XML 有效且与当前不同时才更新 store
    if (isValid && newXml !== bpmnXml) {
      setBpmnXml(newXml)
      setHasUnsavedChanges(true)
    }
  }, [bpmnXml, setBpmnXml, setHasUnsavedChanges, validateXmlContent])

  // 格式化 XML
  const handleFormat = useCallback(async () => {
    if (!validationResult.valid) {
      alert('XML 格式无效，无法格式化')
      return
    }

    setIsFormatting(true)
    try {
      const formatted = formatXml(localXml)
      setLocalXml(formatted)
      if (formatted !== bpmnXml) {
        setBpmnXml(formatted)
        setHasUnsavedChanges(true)
      }
    } catch (error) {
      console.error('格式化失败:', error)
      alert('格式化失败，请检查 XML 语法')
    } finally {
      setIsFormatting(false)
    }
  }, [localXml, bpmnXml, validationResult.valid, setBpmnXml, setHasUnsavedChanges])

  // 复制 XML
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(localXml)
      alert('XML 已复制到剪贴板')
    } catch (error) {
      console.error('复制失败:', error)
      // 降级方案
      const textArea = document.createElement('textarea')
      textArea.value = localXml
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('XML 已复制到剪贴板')
    }
  }, [localXml])

  // 重置 XML
  const handleReset = useCallback(() => {
    if (bpmnXml !== localXml) {
      const confirmed = window.confirm('确定要重置为当前保存的 XML 吗？所有未保存的修改将丢失。')
      if (confirmed) {
        setLocalXml(bpmnXml)
        setValidationResult({ valid: true })
        setHasUnsavedChanges(false)
      }
    }
  }, [bpmnXml, localXml, setHasUnsavedChanges])

  return (
    <div className="xml-editor">
      <div className="xml-editor__toolbar">
        <div className="xml-editor__toolbar-left">
          <span className="xml-editor__title">XML 编辑器</span>
          {!validationResult.valid && (
            <span className="xml-editor__error-badge">
              <Icon name="warning" size={12} />
              格式错误
            </span>
          )}
        </div>
        <div className="xml-editor__toolbar-right">
          <button
            className="xml-editor__btn"
            onClick={handleFormat}
            disabled={isFormatting || !validationResult.valid}
            title="格式化 XML"
          >
            <Icon name="settings" size={14} />
            {isFormatting ? '格式化中...' : '格式化'}
          </button>
          <button
            className="xml-editor__btn"
            onClick={handleCopy}
            title="复制 XML"
          >
            <Icon name="copy" size={14} />
            复制
          </button>
          <button
            className="xml-editor__btn xml-editor__btn--secondary"
            onClick={handleReset}
            disabled={bpmnXml === localXml}
            title="重置为已保存的 XML"
          >
            <Icon name="close" size={14} />
            重置
          </button>
        </div>
      </div>

      {/* 验证错误提示 */}
      {!validationResult.valid && validationResult.error && (
        <div className="xml-editor__error-message">
          <Icon name="warning" size={14} />
          <span>{validationResult.error}</span>
        </div>
      )}

      {/* XML 编辑区域 */}
      <div className="xml-editor__content">
        <textarea
          className="xml-editor__textarea"
          value={localXml}
          onChange={handleXmlChange}
          placeholder="在此编辑 BPMN XML..."
          spellCheck={false}
        />
      </div>

      {/* 状态栏 */}
      <div className="xml-editor__statusbar">
        <div className="xml-editor__statusbar-left">
          <span>字符数: {localXml.length}</span>
          <span>行数: {localXml.split('\n').length}</span>
        </div>
        <div className="xml-editor__statusbar-right">
          {validationResult.valid ? (
            <span className="xml-editor__status xml-editor__status--valid">
              <Icon name="check" size={12} />
              XML 格式有效
            </span>
          ) : (
            <span className="xml-editor__status xml-editor__status--invalid">
              <Icon name="warning" size={12} />
              XML 格式无效
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default XmlEditor