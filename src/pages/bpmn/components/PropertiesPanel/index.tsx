import React, { useState, useEffect } from 'react'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { bpmnService } from '../../../../services/bpmn'
import type { BpmnElement, TaskConfig, EventConfig, GatewayCondition } from '../../../../types/bpmn'
import './index.scss'

interface PropertiesPanelProps {
  className?: string
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ className }) => {
  const { selectedElement, setHasUnsavedChanges } = useBpmnStore()
  
  const [elementName, setElementName] = useState('')
  const [elementId, setElementId] = useState('')
  const [documentation, setDocumentation] = useState('')
  
  // 任务相关属性
  const [taskConfig, setTaskConfig] = useState<TaskConfig>({})
  
  // 事件相关属性
  const [eventConfig, setEventConfig] = useState<EventConfig>({})
  
  // 网关相关属性
  const [gatewayCondition, setGatewayCondition] = useState<GatewayCondition>({})
  
  // 跟踪是否有未保存的修改
  const [hasChanges, setHasChanges] = useState(false)

  // 监听选中元素变化
  useEffect(() => {
    if (selectedElement) {
      setElementName(selectedElement.name || '')
      setElementId(selectedElement.id)
      
      // 根据元素类型初始化配置
      const bo = selectedElement.businessObject
      
      if (bpmnService.isTaskType(selectedElement.type)) {
        setTaskConfig({
          assignee: bo?.assignee || '',
          candidateUsers: bo?.candidateUsers || [],
          candidateGroups: bo?.candidateGroups || [],
          dueDate: bo?.dueDate || '',
          priority: bo?.priority || 50,
          formKey: bo?.formKey || ''
        })
      }
      
      if (bpmnService.isEventType(selectedElement.type)) {
        setEventConfig({
          timerType: bo?.eventDefinitions?.[0]?.$type?.includes('Timer') ? 'timeDuration' : undefined,
          timerValue: bo?.eventDefinitions?.[0]?.timeDuration?.body || '',
          messageRef: bo?.eventDefinitions?.[0]?.messageRef?.name || '',
          signalRef: bo?.eventDefinitions?.[0]?.signalRef?.name || ''
        })
      }
      
      if (bpmnService.isGatewayType(selectedElement.type)) {
        setGatewayCondition({
          conditionExpression: bo?.conditionExpression?.body || '',
          defaultFlow: bo?.default?.id === selectedElement.id
        })
      }
      
      setDocumentation(bo?.documentation?.[0]?.text || '')
      setHasChanges(false)
    } else {
      // 重置表单
      setElementName('')
      setElementId('')
      setDocumentation('')
      setTaskConfig({})
      setEventConfig({})
      setGatewayCondition({})
      setHasChanges(false)
    }
  }, [selectedElement])

  // 更新本地状态（不应用到画布）
  const handleNameChange = (newName: string) => {
    setElementName(newName)
    setHasChanges(true)
  }

  const handleIdChange = (newId: string) => {
    setElementId(newId)
    setHasChanges(true)
  }

  const handleDocumentationChange = (newDoc: string) => {
    setDocumentation(newDoc)
    setHasChanges(true)
  }

  const handleTaskConfigChange = (key: keyof TaskConfig, value: any) => {
    setTaskConfig(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleEventConfigChange = (key: keyof EventConfig, value: any) => {
    setEventConfig(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleGatewayConditionChange = (key: keyof GatewayCondition, value: any) => {
    setGatewayCondition(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  // 保存所有修改到画布
  const handleSave = () => {
    if (!selectedElement) return

    const modeler = useBpmnStore.getState().modelerRef
    if (!modeler) return

    try {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      const element = elementRegistry.get(selectedElement.id)
      
      if (!element) return

      // 准备更新的属性
      const properties: any = {}

      // 更新名称
      if (elementName !== (selectedElement.name || '')) {
        properties.name = elementName
      }

      // 更新ID（需要特殊处理）
      if (elementId !== selectedElement.id) {
        properties.id = elementId
      }

      // 更新文档
      const currentDoc = selectedElement.businessObject?.documentation?.[0]?.text || ''
      if (documentation !== currentDoc) {
        properties.documentation = documentation ? [{ text: documentation }] : []
      }

      // 更新任务配置
      if (bpmnService.isTaskType(selectedElement.type)) {
        const bo = selectedElement.businessObject
        if (taskConfig.assignee !== (bo?.assignee || '')) {
          properties.assignee = taskConfig.assignee
        }
        if (taskConfig.priority !== (bo?.priority || 50)) {
          properties.priority = taskConfig.priority
        }
        if (taskConfig.dueDate !== (bo?.dueDate || '')) {
          properties.dueDate = taskConfig.dueDate
        }
        if (taskConfig.formKey !== (bo?.formKey || '')) {
          properties.formKey = taskConfig.formKey
        }
      }

      // 应用所有更改
      if (Object.keys(properties).length > 0) {
        modeling.updateProperties(element, properties)
        setHasUnsavedChanges(true)
        console.log('属性已保存到节点:', properties)
      }

      setHasChanges(false)
    } catch (error) {
      console.error('保存属性失败:', error)
    }
  }

  // 放弃修改
  const handleDiscard = () => {
    if (selectedElement) {
      setElementName(selectedElement.name || '')
      setElementId(selectedElement.id)
      
      const bo = selectedElement.businessObject
      setDocumentation(bo?.documentation?.[0]?.text || '')
      
      if (bpmnService.isTaskType(selectedElement.type)) {
        setTaskConfig({
          assignee: bo?.assignee || '',
          candidateUsers: bo?.candidateUsers || [],
          candidateGroups: bo?.candidateGroups || [],
          dueDate: bo?.dueDate || '',
          priority: bo?.priority || 50,
          formKey: bo?.formKey || ''
        })
      }
    }
    setHasChanges(false)
  }

  // 渲染基本属性
  const renderBasicProperties = () => (
    <div className="properties-panel__section">
      <h4 className="properties-panel__section-title">基本属性</h4>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">元素ID</label>
        <input
          type="text"
          className="properties-panel__input"
          value={elementId}
          onChange={(e) => handleIdChange(e.target.value)}
          placeholder="元素ID"
        />
      </div>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">名称</label>
        <input
          type="text"
          className="properties-panel__input"
          value={elementName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="元素名称"
        />
      </div>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">文档</label>
        <textarea
          className="properties-panel__textarea"
          value={documentation}
          onChange={(e) => handleDocumentationChange(e.target.value)}
          placeholder="输入文档说明..."
          rows={3}
        />
      </div>
    </div>
  )

  // 渲染任务属性
  const renderTaskProperties = () => {
    if (!selectedElement || !bpmnService.isTaskType(selectedElement.type)) {
      return null
    }

    return (
      <div className="properties-panel__section">
        <h4 className="properties-panel__section-title">任务配置</h4>
        
        {selectedElement.type === 'bpmn:UserTask' && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">处理人</label>
              <input
                type="text"
                className="properties-panel__input"
                value={taskConfig.assignee || ''}
                onChange={(e) => handleTaskConfigChange('assignee', e.target.value)}
                placeholder="指定处理人"
              />
            </div>
            
            <div className="properties-panel__field">
              <label className="properties-panel__label">候选人用户</label>
              <input
                type="text"
                className="properties-panel__input"
                value={taskConfig.candidateUsers?.join(', ') || ''}
                onChange={(e) => handleTaskConfigChange('candidateUsers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="多个用户用逗号分隔"
              />
            </div>
            
            <div className="properties-panel__field">
              <label className="properties-panel__label">候选组</label>
              <input
                type="text"
                className="properties-panel__input"
                value={taskConfig.candidateGroups?.join(', ') || ''}
                onChange={(e) => handleTaskConfigChange('candidateGroups', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="多个组用逗号分隔"
              />
            </div>
          </>
        )}
        
        <div className="properties-panel__field">
          <label className="properties-panel__label">到期时间</label>
          <input
            type="text"
            className="properties-panel__input"
            value={taskConfig.dueDate || ''}
            onChange={(e) => handleTaskConfigChange('dueDate', e.target.value)}
            placeholder="例如: ${dueDate}"
          />
        </div>
        
        <div className="properties-panel__field">
          <label className="properties-panel__label">优先级</label>
          <input
            type="number"
            className="properties-panel__input"
            value={taskConfig.priority || 50}
            onChange={(e) => handleTaskConfigChange('priority', parseInt(e.target.value))}
            min={0}
            max={100}
          />
        </div>
        
        <div className="properties-panel__field">
          <label className="properties-panel__label">表单Key</label>
          <input
            type="text"
            className="properties-panel__input"
            value={taskConfig.formKey || ''}
            onChange={(e) => handleTaskConfigChange('formKey', e.target.value)}
            placeholder="表单标识"
          />
        </div>
      </div>
    )
  }

  // 渲染事件属性
  const renderEventProperties = () => {
    if (!selectedElement || !bpmnService.isEventType(selectedElement.type)) {
      return null
    }

    return (
      <div className="properties-panel__section">
        <h4 className="properties-panel__section-title">事件配置</h4>
        
        {/* 定时器事件 */}
        {(selectedElement.type.includes('Timer') || selectedElement.type === 'bpmn:IntermediateCatchEvent') && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">定时器类型</label>
              <select
                className="properties-panel__select"
                value={eventConfig.timerType || ''}
                onChange={(e) => handleEventConfigChange('timerType', e.target.value)}
              >
                <option value="">选择类型</option>
                <option value="timeDate">指定日期</option>
                <option value="timeDuration">持续时间</option>
                <option value="timeCycle">周期</option>
              </select>
            </div>
            
            <div className="properties-panel__field">
              <label className="properties-panel__label">定时器值</label>
              <input
                type="text"
                className="properties-panel__input"
                value={eventConfig.timerValue || ''}
                onChange={(e) => handleEventConfigChange('timerValue', e.target.value)}
                placeholder="例如: PT5M (5分钟)"
              />
            </div>
          </>
        )}
        
        {/* 消息事件 */}
        {selectedElement.type.includes('Message') && (
          <div className="properties-panel__field">
            <label className="properties-panel__label">消息引用</label>
            <input
              type="text"
              className="properties-panel__input"
              value={eventConfig.messageRef || ''}
              onChange={(e) => handleEventConfigChange('messageRef', e.target.value)}
              placeholder="消息名称"
            />
          </div>
        )}
        
        {/* 信号事件 */}
        {selectedElement.type.includes('Signal') && (
          <div className="properties-panel__field">
            <label className="properties-panel__label">信号引用</label>
            <input
              type="text"
              className="properties-panel__input"
              value={eventConfig.signalRef || ''}
              onChange={(e) => handleEventConfigChange('signalRef', e.target.value)}
              placeholder="信号名称"
            />
          </div>
        )}
      </div>
    )
  }

  // 渲染网关属性
  const renderGatewayProperties = () => {
    if (!selectedElement || !bpmnService.isGatewayType(selectedElement.type)) {
      return null
    }

    return (
      <div className="properties-panel__section">
        <h4 className="properties-panel__section-title">网关配置</h4>
        
        {selectedElement.type === 'bpmn:ExclusiveGateway' && (
          <>
            <div className="properties-panel__field">
              <label className="properties-panel__label">条件表达式</label>
              <textarea
                className="properties-panel__textarea"
                value={gatewayCondition.conditionExpression || ''}
                onChange={(e) => handleGatewayConditionChange('conditionExpression', e.target.value)}
                placeholder="例如: ${approved == true}"
                rows={3}
              />
            </div>
            
            <div className="properties-panel__field">
              <label className="properties-panel__checkbox-label">
                <input
                  type="checkbox"
                  className="properties-panel__checkbox"
                  checked={gatewayCondition.defaultFlow || false}
                  onChange={(e) => handleGatewayConditionChange('defaultFlow', e.target.checked)}
                />
                设为默认流
              </label>
            </div>
          </>
        )}
      </div>
    )
  }

  // 如果没有选中元素
  if (!selectedElement) {
    return (
      <div className={`properties-panel ${className || ''}`}>
        <div className="properties-panel__empty">
          <div className="properties-panel__empty-icon">📝</div>
          <div className="properties-panel__empty-text">
            选择一个元素以查看和编辑其属性
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`properties-panel ${className || ''}`}>
      <div className="properties-panel__header">
        <h3 className="properties-panel__title">属性面板</h3>
        <div className="properties-panel__element-info">
          <span className="properties-panel__element-type">
            {bpmnService.getElementTypeName(selectedElement.type)}
          </span>
        </div>
      </div>

      <div className="properties-panel__content">
        {renderBasicProperties()}
        {renderTaskProperties()}
        {renderEventProperties()}
        {renderGatewayProperties()}
      </div>

      {/* 保存按钮区域 */}
      {hasChanges && (
        <div className="properties-panel__footer">
          <div className="properties-panel__actions">
            <button
              className="properties-panel__btn properties-panel__btn--discard"
              onClick={handleDiscard}
            >
              放弃
            </button>
            <button
              className="properties-panel__btn properties-panel__btn--save"
              onClick={handleSave}
            >
              💾 保存到节点
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PropertiesPanel