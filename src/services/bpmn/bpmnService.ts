import type { ProcessDefinition, ExportOptions, ImportOptions, ValidationResult, BpmnError } from '../../types/bpmn'

// 生成唯一ID
const generateId = (): string => {
  return `Process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 默认BPMN模板
const createDefaultBpmnXml = (processId: string, processName: string): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" 
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="BPMN Designer"
  exporterVersion="1.0.0">
  <bpmn:process id="${processId}" name="${processName}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="开始">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="审批">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="结束">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="158" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="398" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="392" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

// 验证BPMN XML格式
const validateBpmnXml = (xml: string): ValidationResult => {
  const errors: BpmnError[] = []
  const warnings: BpmnError[] = []

  try {
    // 基本XML格式检查
    if (!xml || xml.trim().length === 0) {
      errors.push({
        code: 'EMPTY_XML',
        message: 'BPMN XML内容为空'
      })
      return { valid: false, errors, warnings }
    }

    // 检查必要的命名空间
    const requiredNamespaces = [
      'http://www.omg.org/spec/BPMN/20100524/MODEL'
    ]

    for (const ns of requiredNamespaces) {
      if (!xml.includes(ns)) {
        errors.push({
          code: 'MISSING_NAMESPACE',
          message: `缺少必要的命名空间: ${ns}`
        })
      }
    }

    // 检查必要的元素
    if (!xml.includes('bpmn:definitions')) {
      errors.push({
        code: 'MISSING_DEFINITIONS',
        message: '缺少bpmn:definitions根元素'
      })
    }

    if (!xml.includes('bpmn:process')) {
      errors.push({
        code: 'MISSING_PROCESS',
        message: '缺少bpmn:process元素'
      })
    }

    // 警告检查
    if (!xml.includes('isExecutable="true"')) {
      warnings.push({
        code: 'NOT_EXECUTABLE',
        message: '流程未设置为可执行'
      })
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  } catch (error) {
    errors.push({
      code: 'PARSE_ERROR',
      message: `XML解析错误: ${error instanceof Error ? error.message : '未知错误'}`
    })
    return { valid: false, errors, warnings }
  }
}

// 格式化XML
const formatXml = (xml: string): string => {
  try {
    // 简单的XML格式化
    let formatted = ''
    let indent = 0
    const lines = xml.replace(/>\s*</g, '>\n<').split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1)
      }
      
      formatted += '  '.repeat(indent) + trimmed + '\n'
      
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
        indent++
      }
    }
    
    return formatted.trim()
  } catch {
    return xml
  }
}

// 从XML中提取流程信息
const extractProcessInfo = (xml: string): { id: string; name: string } | null => {
  try {
    const idMatch = xml.match(/bpmn:process\s+id="([^"]+)"/)
    const nameMatch = xml.match(/bpmn:process\s+[^>]*name="([^"]+)"/)
    
    if (idMatch) {
      return {
        id: idMatch[1],
        name: nameMatch ? nameMatch[1] : '未命名流程'
      }
    }
    return null
  } catch {
    return null
  }
}

// BPMN服务
export const bpmnService = {
  // 创建新流程
  createProcess(name: string, description?: string): ProcessDefinition {
    const id = generateId()
    const now = Date.now()
    
    return {
      id,
      name,
      description,
      bpmnXml: createDefaultBpmnXml(id, name),
      createdAt: now,
      updatedAt: now,
      version: 1
    }
  },

  // 复制流程
  duplicateProcess(process: ProcessDefinition): ProcessDefinition {
    const id = generateId()
    const now = Date.now()
    
    // 替换XML中的ID
    let newXml = process.bpmnXml
    const oldIdMatch = process.bpmnXml.match(/bpmn:process\s+id="([^"]+)"/)
    if (oldIdMatch) {
      newXml = newXml.replace(new RegExp(oldIdMatch[1], 'g'), id)
    }
    
    return {
      ...process,
      id,
      name: `${process.name} (副本)`,
      bpmnXml: newXml,
      createdAt: now,
      updatedAt: now,
      version: 1
    }
  },

  // 更新流程XML
  updateProcessXml(process: ProcessDefinition, xml: string): ProcessDefinition {
    return {
      ...process,
      bpmnXml: xml,
      updatedAt: Date.now(),
      version: process.version + 1
    }
  },

  // 更新流程信息
  updateProcessInfo(
    process: ProcessDefinition, 
    data: { name?: string; description?: string }
  ): ProcessDefinition {
    return {
      ...process,
      ...data,
      updatedAt: Date.now()
    }
  },

  // 验证BPMN XML
  validateXml(xml: string): ValidationResult {
    return validateBpmnXml(xml)
  },

  // 格式化XML
  formatXml(xml: string): string {
    return formatXml(xml)
  },

  // 导出流程
  async exportProcess(
    process: ProcessDefinition, 
    options: ExportOptions
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      switch (options.format) {
        case 'bpmn': {
          const xml = options.prettify ? formatXml(process.bpmnXml) : process.bpmnXml
          return { success: true, data: xml }
        }
        case 'svg': {
          // SVG导出需要从画布获取
          return { 
            success: false, 
            error: 'SVG导出需要通过画布组件实现' 
          }
        }
        case 'png': {
          // PNG导出需要从画布获取
          return { 
            success: false, 
            error: 'PNG导出需要通过画布组件实现' 
          }
        }
        default:
          return { success: false, error: '不支持的导出格式' }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '导出失败' 
      }
    }
  },

  // 导入流程
  importProcess(
    xml: string, 
    name?: string
  ): { success: boolean; process?: ProcessDefinition; errors?: BpmnError[] } {
    const validation = validateBpmnXml(xml)
    
    if (!validation.valid) {
      return { success: false, errors: validation.errors }
    }
    
    const processInfo = extractProcessInfo(xml)
    const now = Date.now()
    
    const process: ProcessDefinition = {
      id: processInfo?.id || generateId(),
      name: name || processInfo?.name || '导入的流程',
      bpmnXml: formatXml(xml),
      createdAt: now,
      updatedAt: now,
      version: 1
    }
    
    return { success: true, process }
  },

  // 从文件导入
  async importFromFile(file: File): Promise<{
    success: boolean
    process?: ProcessDefinition
    errors?: BpmnError[]
  }> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const xml = e.target?.result as string
        resolve(this.importProcess(xml, file.name.replace('.bpmn', '')))
      }
      
      reader.onerror = () => {
        resolve({ 
          success: false, 
          errors: [{ code: 'READ_ERROR', message: '文件读取失败' }] 
        })
      }
      
      reader.readAsText(file)
    })
  },

  // 下载文件
  downloadFile(content: string, filename: string, mimeType: string = 'application/xml'): void {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // 获取元素类型显示名称
  getElementTypeName(type: string): string {
    const typeNames: Record<string, string> = {
      'bpmn:StartEvent': '开始事件',
      'bpmn:EndEvent': '结束事件',
      'bpmn:IntermediateThrowEvent': '中间抛出事件',
      'bpmn:IntermediateCatchEvent': '中间捕获事件',
      'bpmn:BoundaryEvent': '边界事件',
      'bpmn:Task': '任务',
      'bpmn:UserTask': '用户任务',
      'bpmn:ServiceTask': '服务任务',
      'bpmn:ScriptTask': '脚本任务',
      'bpmn:ManualTask': '手动任务',
      'bpmn:BusinessRuleTask': '业务规则任务',
      'bpmn:SendTask': '发送任务',
      'bpmn:ReceiveTask': '接收任务',
      'bpmn:ExclusiveGateway': '排他网关',
      'bpmn:ParallelGateway': '并行网关',
      'bpmn:InclusiveGateway': '包容网关',
      'bpmn:EventBasedGateway': '事件网关',
      'bpmn:ComplexGateway': '复杂网关',
      'bpmn:SequenceFlow': '顺序流',
      'bpmn:MessageFlow': '消息流',
      'bpmn:Association': '关联',
      'bpmn:Collaboration': '协作',
      'bpmn:Participant': '参与者',
      'bpmn:Lane': '泳道',
      'bpmn:SubProcess': '子流程',
      'bpmn:CallActivity': '调用活动'
    }
    return typeNames[type] || type
  },

  // 检查是否为任务类型
  isTaskType(type: string): boolean {
    return [
      'bpmn:Task',
      'bpmn:UserTask',
      'bpmn:ServiceTask',
      'bpmn:ScriptTask',
      'bpmn:ManualTask',
      'bpmn:BusinessRuleTask',
      'bpmn:SendTask',
      'bpmn:ReceiveTask'
    ].includes(type)
  },

  // 检查是否为事件类型
  isEventType(type: string): boolean {
    return [
      'bpmn:StartEvent',
      'bpmn:EndEvent',
      'bpmn:IntermediateThrowEvent',
      'bpmn:IntermediateCatchEvent',
      'bpmn:BoundaryEvent'
    ].includes(type)
  },

  // 检查是否为网关类型
  isGatewayType(type: string): boolean {
    return [
      'bpmn:ExclusiveGateway',
      'bpmn:ParallelGateway',
      'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway',
      'bpmn:ComplexGateway'
    ].includes(type)
  }
}