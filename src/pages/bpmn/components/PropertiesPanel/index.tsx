import React, { useState, useEffect, useRef } from 'react'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { bpmnService } from '../../../../services/bpmn'
import type { BpmnElement, TaskConfig, EventConfig, GatewayCondition } from '../../../../types/bpmn'
import './index.scss'

// Process属性接口
interface ProcessConfig {
  id: string
  name: string
  isExecutable: boolean
  documentation: string
}

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
  
  // Process属性
  const [processConfig, setProcessConfig] = useState<ProcessConfig>({
    id: '',
    name: '',
    isExecutable: false,
    documentation: ''
  })
  
  // 跟踪是否有未保存的修改
  const [hasChanges, setHasChanges] = useState(false)
  
  // 确认对话框相关状态
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingElement, setPendingElement] = useState<BpmnElement | null>(null)
  
  // 使用 ref 追踪上一个选中的元素
  const prevSelectedElementRef = useRef<BpmnElement | null>(null)

  // 加载元素数据到表单
  const loadElementData = (element: BpmnElement) => {
    setElementName(element.name || '')
    setElementId(element.id)
    
    // 根据元素类型初始化配置
    const bo = element.businessObject
    
    if (bpmnService.isTaskType(element.type)) {
      setTaskConfig({
        assignee: bo?.assignee || '',
        candidateUsers: bo?.candidateUsers || [],
        candidateGroups: bo?.candidateGroups || [],
        dueDate: bo?.dueDate || '',
        priority: bo?.priority || 50,
        formKey: bo?.formKey || ''
      })
    } else {
      setTaskConfig({})
    }
    
    if (bpmnService.isEventType(element.type)) {
      setEventConfig({
        timerType: bo?.eventDefinitions?.[0]?.$type?.includes('Timer') ? 'timeDuration' : undefined,
        timerValue: bo?.eventDefinitions?.[0]?.timeDuration?.body || '',
        messageRef: bo?.eventDefinitions?.[0]?.messageRef?.name || '',
        signalRef: bo?.eventDefinitions?.[0]?.signalRef?.name || ''
      })
    } else {
      setEventConfig({})
    }
    
    if (bpmnService.isGatewayType(element.type)) {
      setGatewayCondition({
        conditionExpression: bo?.conditionExpression?.body || '',
        defaultFlow: bo?.default?.id === element.id
      })
    } else {
      setGatewayCondition({})
    }
    
    setDocumentation(bo?.documentation?.[0]?.text || '')
    setHasChanges(false)
  }

  // 获取Process元素
  const getProcessElement = () => {
    const modeler = useBpmnStore.getState().modelerRef
    if (!modeler) return null
    
    try {
      const elementRegistry = modeler.get('elementRegistry')
      const processElement = elementRegistry.find((el: any) => el.type === 'bpmn:Process')
      return processElement
    } catch (error) {
      console.error('获取Process元素失败:', error)
      return null
    }
  }

  // 加载Process数据
  const loadProcessData = () => {
    const processElement = getProcessElement()
    if (!processElement) {
      // 如果没有找到Process元素，使用默认值
      setProcessConfig({
        id: 'Process_1',
        name: '流程',
        isExecutable: false,
        documentation: ''
      })
      return
    }

    const bo = processElement.businessObject
    setProcessConfig({
      id: bo?.id || processElement.id || 'Process_1',
      name: bo?.name || '',
      isExecutable: bo?.isExecutable || false,
      documentation: bo?.documentation?.[0]?.text || ''
    })
    setHasChanges(false)
  }

  // 重置表单
  const resetForm = () => {
    setElementName('')
    setElementId('')
    setDocumentation('')
    setTaskConfig({})
    setEventConfig({})
    setGatewayCondition({})
    setHasChanges(false)
    // 加载Process数据
    loadProcessData()
  }

  // 监听选中元素变化
  useEffect(() => {
    if (selectedElement) {
      // 检查是否是元素切换（而非初始化）
      const prevElement = prevSelectedElementRef.current
      const isElementSwitch = prevElement && prevElement.id !== selectedElement.id
      
      // 如果有未保存修改且是元素切换，显示确认弹窗
      if (hasChanges && isElementSwitch) {
        setPendingElement(selectedElement)
        setShowConfirmDialog(true)
        return
      }
      
      // 无修改或初始化，正常加载元素数据
      loadElementData(selectedElement)
      prevSelectedElementRef.current = selectedElement
    } else {
      // 重置表单并加载Process数据
      resetForm()
      prevSelectedElementRef.current = null
    }
  }, [selectedElement]) // 只监听 selectedElement 变化

  // 初始化时加载Process数据
  useEffect(() => {
    if (!selectedElement) {
      loadProcessData()
    }
  }, []) // 仅在组件挂载时执行

  // 监听 modeler 的元素变化事件，同步属性面板数据
  useEffect(() => {
    const modeler = useBpmnStore.getState().modelerRef
    if (!modeler) return

    const handleElementChanged = (event: any) => {
      const { element } = event
      
      // 如果当前选中的元素被修改了，刷新表单数据
      if (selectedElement && selectedElement.id === element.id) {
        const updatedElement: BpmnElement = {
          id: element.id,
          type: element.type as any,
          name: element.businessObject?.name,
          businessObject: element.businessObject
        }
        
        // 刷新表单数据
        loadElementData(updatedElement)
        
        // 同时更新 store 中的 selectedElement
        const { setSelectedElement } = useBpmnStore.getState()
        setSelectedElement(updatedElement)
      }
      
      // 如果修改的是 Process 元素，刷新 Process 数据
      if (element.type === 'bpmn:Process') {
        loadProcessData()
      }
    }

    modeler.on('element.changed', handleElementChanged)

    return () => {
      modeler.off('element.changed', handleElementChanged)
    }
  }, [selectedElement]) // 当 selectedElement 变化时重新绑定事件

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

  // 保存指定元素的修改到画布
  const handleSaveElement = (elementToSave: BpmnElement) => {
    const modeler = useBpmnStore.getState().modelerRef
    if (!modeler) return

    try {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      const element = elementRegistry.get(elementToSave.id)
      
      if (!element) return

      // 准备更新的属性
      const properties: any = {}

      // 更新名称
      if (elementName !== (elementToSave.name || '')) {
        properties.name = elementName
      }

      // 更新ID（需要特殊处理）
      if (elementId !== elementToSave.id) {
        properties.id = elementId
      }

      // 更新文档
      const currentDoc = elementToSave.businessObject?.documentation?.[0]?.text || ''
      if (documentation !== currentDoc) {
        properties.documentation = documentation ? [{ text: documentation }] : []
      }

      // 更新任务配置
      if (bpmnService.isTaskType(elementToSave.type)) {
        const bo = elementToSave.businessObject
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
        
        // 保存后更新 selectedElement 状态，使其显示最新的属性值
        const updatedElement = elementRegistry.get(elementToSave.id)
        if (updatedElement) {
          const { setSelectedElement } = useBpmnStore.getState()
          setSelectedElement(updatedElement)
        }
      }

      setHasChanges(false)
    } catch (error) {
      console.error('保存属性失败:', error)
    }
  }

  // Process属性变更处理
  const handleProcessConfigChange = (key: keyof ProcessConfig, value: any) => {
    setProcessConfig(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  // 保存Process属性
  const handleSaveProcess = () => {
    const modeler = useBpmnStore.getState().modelerRef
    if (!modeler) return

    try {
      const processElement = getProcessElement()
      if (!processElement) {
        console.warn('未找到Process元素')
        return
      }

      const modeling = modeler.get('modeling')
      
      // 准备更新的属性
      const properties: any = {}

      // 更新名称
      if (processConfig.name !== (processElement.businessObject?.name || '')) {
        properties.name = processConfig.name
      }

      // 更新isExecutable
      if (processConfig.isExecutable !== (processElement.businessObject?.isExecutable || false)) {
        properties.isExecutable = processConfig.isExecutable
      }

      // 更新文档
      const currentDoc = processElement.businessObject?.documentation?.[0]?.text || ''
      if (processConfig.documentation !== currentDoc) {
        properties.documentation = processConfig.documentation ? [{ text: processConfig.documentation }] : []
      }

      // 应用所有更改
      if (Object.keys(properties).length > 0) {
        modeling.updateProperties(processElement, properties)
        const { setHasUnsavedChanges, pushToUndoStack, setBpmnXml, bpmnXml } = useBpmnStore.getState()
        setHasUnsavedChanges(true)
        console.log('Process属性已保存:', properties)
        
        // 触发 XML 更新
        modeler.saveXML({ format: true }).then(({ xml }: { xml: string }) => {
          if (xml) {
            pushToUndoStack(bpmnXml)
            setBpmnXml(xml)
          }
        })
      }

      setHasChanges(false)
    } catch (error) {
      console.error('保存Process属性失败:', error)
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
    } else {
      // 放弃Process属性修改，重新加载
      loadProcessData()
    }
    setHasChanges(false)
  }

  // 保存当前修改（根据是否选中元素）
  const handleSave = () => {
    if (selectedElement) {
      handleSaveElement(selectedElement)
    } else {
      handleSaveProcess()
    }
  }

  // 确认对话框处理函数
  const handleConfirmSave = () => {
    // 保存之前的元素（元素 A）的修改
    if (prevSelectedElementRef.current) {
      handleSaveElement(prevSelectedElementRef.current)
    }
    
    // 切换到待处理的元素（元素 B）
    if (pendingElement) {
      loadElementData(pendingElement)
      prevSelectedElementRef.current = pendingElement
    }
    
    // 关闭弹窗
    setShowConfirmDialog(false)
    setPendingElement(null)
  }

  const handleConfirmDiscard = () => {
    // 放弃当前修改
    setHasChanges(false)
    
    // 切换到待处理的元素
    if (pendingElement) {
      loadElementData(pendingElement)
      prevSelectedElementRef.current = pendingElement
    }
    
    // 关闭弹窗
    setShowConfirmDialog(false)
    setPendingElement(null)
  }

  const handleConfirmCancel = () => {
    // 取消切换，恢复之前选中的元素
    const { setSelectedElement } = useBpmnStore.getState()
    if (prevSelectedElementRef.current) {
      setSelectedElement(prevSelectedElementRef.current)
    }
    
    // 关闭弹窗
    setShowConfirmDialog(false)
    setPendingElement(null)
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

  // 渲染Process属性
  const renderProcessProperties = () => (
    <div className="properties-panel__section">
      <h4 className="properties-panel__section-title">流程属性</h4>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">流程ID</label>
        <input
          type="text"
          className="properties-panel__input"
          value={processConfig.id}
          onChange={(e) => handleProcessConfigChange('id', e.target.value)}
          placeholder="流程ID"
          disabled
        />
      </div>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">流程名称</label>
        <input
          type="text"
          className="properties-panel__input"
          value={processConfig.name}
          onChange={(e) => handleProcessConfigChange('name', e.target.value)}
          placeholder="输入流程名称"
        />
      </div>
      
      <div className="properties-panel__field">
        <label className="properties-panel__checkbox-label">
          <input
            type="checkbox"
            className="properties-panel__checkbox"
            checked={processConfig.isExecutable}
            onChange={(e) => handleProcessConfigChange('isExecutable', e.target.checked)}
          />
          可执行
        </label>
      </div>
      
      <div className="properties-panel__field">
        <label className="properties-panel__label">流程文档</label>
        <textarea
          className="properties-panel__textarea"
          value={processConfig.documentation}
          onChange={(e) => handleProcessConfigChange('documentation', e.target.value)}
          placeholder="输入流程说明..."
          rows={3}
        />
      </div>
    </div>
  )

  // 如果没有选中元素，显示Process属性
  if (!selectedElement) {
    return (
      <div className={`properties-panel ${className || ''}`}>
        <div className="properties-panel__header">
          <h3 className="properties-panel__title">属性面板</h3>
          <div className="properties-panel__element-info">
            <span className="properties-panel__element-type">
              流程
            </span>
          </div>
        </div>

        <div className="properties-panel__content">
          {renderProcessProperties()}
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
                💾 保存
              </button>
            </div>
          </div>
        )}
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

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className="properties-panel__modal-overlay" onClick={handleConfirmCancel}>
          <div className="properties-panel__modal" onClick={(e) => e.stopPropagation()}>
            <div className="properties-panel__modal-header">
              <h4 className="properties-panel__modal-title">未保存的修改</h4>
            </div>

            <div className="properties-panel__modal-body">
              <p className="properties-panel__confirm-text">
                当前元素有未保存的修改，是否保存？
              </p>
              <p className="properties-panel__confirm-warning">
                切换元素将丢失未保存的修改。
              </p>
            </div>

            <div className="properties-panel__modal-footer">
              <button
                className="properties-panel__modal-btn properties-panel__modal-btn--cancel"
                onClick={handleConfirmCancel}
              >
                取消
              </button>
              <button
                className="properties-panel__modal-btn properties-panel__modal-btn--discard"
                onClick={handleConfirmDiscard}
              >
                放弃修改
              </button>
              <button
                className="properties-panel__modal-btn properties-panel__modal-btn--save"
                onClick={handleConfirmSave}
              >
                保存并切换
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PropertiesPanel