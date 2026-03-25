// BPMN 类型定义

// 流程定义
export interface ProcessDefinition {
  id: string
  name: string
  description?: string
  bpmnXml: string
  createdAt: number
  updatedAt: number
  version: number
}

// BPMN元素类型
export type BpmnElementType =
  | 'bpmn:Process'
  | 'bpmn:StartEvent'
  | 'bpmn:EndEvent'
  | 'bpmn:IntermediateThrowEvent'
  | 'bpmn:IntermediateCatchEvent'
  | 'bpmn:BoundaryEvent'
  | 'bpmn:Task'
  | 'bpmn:UserTask'
  | 'bpmn:ServiceTask'
  | 'bpmn:ScriptTask'
  | 'bpmn:ManualTask'
  | 'bpmn:BusinessRuleTask'
  | 'bpmn:SendTask'
  | 'bpmn:ReceiveTask'
  | 'bpmn:ExclusiveGateway'
  | 'bpmn:ParallelGateway'
  | 'bpmn:InclusiveGateway'
  | 'bpmn:EventBasedGateway'
  | 'bpmn:ComplexGateway'
  | 'bpmn:SequenceFlow'
  | 'bpmn:MessageFlow'
  | 'bpmn:Association'
  | 'bpmn:Collaboration'
  | 'bpmn:Participant'
  | 'bpmn:Lane'
  | 'bpmn:SubProcess'
  | 'bpmn:CallActivity'

// BPMN元素
export interface BpmnElement {
  id: string
  type: BpmnElementType
  name?: string
  businessObject?: any
}

// 任务配置
export interface TaskConfig {
  assignee?: string
  candidateUsers?: string[]
  candidateGroups?: string[]
  dueDate?: string
  priority?: number
  formKey?: string
}

// 网关条件
export interface GatewayCondition {
  conditionExpression?: string
  defaultFlow?: boolean
}

// 事件配置
export interface EventConfig {
  timerType?: 'timeDate' | 'timeDuration' | 'timeCycle'
  timerValue?: string
  messageRef?: string
  signalRef?: string
}

// 节点属性
export interface NodeProperties {
  id: string
  name?: string
  documentation?: string
  executionListeners?: ExecutionListener[]
  taskListeners?: TaskListener[]
  extensions?: Record<string, any>
}

// 执行监听器
export interface ExecutionListener {
  event: 'start' | 'end' | 'take'
  className?: string
  expression?: string
  delegateExpression?: string
}

// 任务监听器
export interface TaskListener {
  event: 'create' | 'assignment' | 'complete' | 'delete' | 'update' | 'timeout'
  className?: string
  expression?: string
  delegateExpression?: string
}

// 流程变量
export interface ProcessVariable {
  name: string
  type: 'string' | 'integer' | 'long' | 'double' | 'boolean' | 'date' | 'object'
  defaultValue?: any
  required?: boolean
}

// BPMN画布配置
export interface BpmnCanvasConfig {
  container: HTMLElement
  width?: number | string
  height?: number | string
  additionalModules?: any[]
  moddleExtensions?: Record<string, any>
}

// BPMN操作历史
export interface BpmnHistory {
  undoStack: string[]
  redoStack: string[]
  maxSize: number
}

// 导出选项
export interface ExportOptions {
  format: 'bpmn' | 'svg' | 'png'
  prettify?: boolean
}

// 导入选项
export interface ImportOptions {
  bpmnXml: string
  skipValidation?: boolean
}

// 元素搜索条件
export interface ElementFilter {
  type?: BpmnElementType | BpmnElementType[]
  name?: string
  id?: string
}

// 对齐方式
export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

// 分布方式
export type DistributionType = 'horizontal' | 'vertical'

// 缩放选项
export interface ZoomOptions {
  level: number | 'fit-viewport'
  center?: { x: number; y: number }
}

// 迷你地图配置
export interface MinimapConfig {
  open: boolean
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

// 工具栏操作类型
export type ToolbarAction =
  | 'undo'
  | 'redo'
  | 'save'
  | 'import'
  | 'export'
  | 'export-svg'
  | 'export-png'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fit-viewport'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'minimap'

// 错误类型
export interface BpmnError {
  code: string
  message: string
  element?: string
  line?: number
  column?: number
}

// 验证结果
export interface ValidationResult {
  valid: boolean
  errors: BpmnError[]
  warnings: BpmnError[]
}