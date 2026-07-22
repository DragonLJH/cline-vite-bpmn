// BPMN XML 解析工具函数

import { parseFfmpegConfigFromXmlElement } from '../services/ffmpeg/configCodec'
import type { WorkflowGraph, WorkflowTask } from '../types/bpmn'

// 解析后的节点接口
export interface ParsedNode {
  id: string
  type: string
  name?: string
  attributes: Record<string, string>
  children?: ParsedNode[]
  incoming?: string[]
  outgoing?: string[]
  properties: Record<string, any>
}

// 解析后的流程信息
export interface ParsedProcess {
  id: string
  name?: string
  isExecutable: boolean
  nodes: ParsedNode[]
  sequenceFlows: ParsedNode[]
}

// 使用DOMParser解析XML
const createParser = () => {
  if (typeof window !== 'undefined' && window.DOMParser) {
    return new DOMParser()
  }
  return null
}

// 解析XML字符串为DOM文档
export const parseXmlToDoc = (xmlString: string): Document | null => {
  const parser = createParser()
  if (!parser) {
    console.error('DOMParser not available')
    return null
  }

  try {
    const doc = parser.parseFromString(xmlString, 'application/xml')
    const parserError = doc.querySelector('parsererror')
    if (parserError) {
      console.error('XML解析错误:', parserError.textContent)
      return null
    }
    return doc
  } catch (error) {
    console.error('XML解析失败:', error)
    return null
  }
}

// 提取元素的所有属性
const extractAttributes = (element: Element): Record<string, string> => {
  const attributes: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i]
    attributes[attr.name] = attr.value
  }
  return attributes
}

// 解析BPMN元素为节点
const parseElement = (element: Element): ParsedNode => {
  const attributes = extractAttributes(element)
  const node: ParsedNode = {
    id: element.getAttribute('id') || '',
    type: element.tagName,
    name: element.getAttribute('name') || undefined,
    attributes,
    incoming: [],
    outgoing: [],
    properties: {}
  }

  // 提取incoming和outgoing
  const incomingElements = element.getElementsByTagNameNS(
    'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'incoming'
  )
  const outgoingElements = element.getElementsByTagNameNS(
    'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'outgoing'
  )

  for (let i = 0; i < incomingElements.length; i++) {
    node.incoming?.push(incomingElements[i].textContent || '')
  }

  for (let i = 0; i < outgoingElements.length; i++) {
    node.outgoing?.push(outgoingElements[i].textContent || '')
  }

  // 提取扩展属性（如assignee、priority等）
  const extensionElements = element.getElementsByTagNameNS(
    'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'extensionElements'
  )
  
  if (extensionElements.length > 0) {
    // 这里可以根据需要解析Camunda等扩展属性
    node.properties.extensionElements = extensionElements[0].outerHTML
  }

  // 提取文档
  const documentation = element.getElementsByTagNameNS(
    'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'documentation'
  )
  if (documentation.length > 0) {
    node.properties.documentation = documentation[0].textContent || ''
  }

  // 提取条件表达式
  const conditionExpression = element.getElementsByTagNameNS(
    'http://www.omg.org/spec/BPMN/20100524/MODEL',
    'conditionExpression'
  )
  if (conditionExpression.length > 0) {
    node.properties.conditionExpression = conditionExpression[0].textContent || ''
  }

  return node
}

// 解析BPMN流程
export const parseBpmnProcess = (xmlString: string): ParsedProcess | null => {
  const doc = parseXmlToDoc(xmlString)
  if (!doc) return null

  const processElement = doc.querySelector('bpmn\\:process, process')
  if (!processElement) {
    console.error('未找到bpmn:process元素')
    return null
  }

  const processId = processElement.getAttribute('id') || ''
  const processName = processElement.getAttribute('name') || undefined
  const isExecutable = processElement.getAttribute('isExecutable') === 'true'

  const nodes: ParsedNode[] = []
  const sequenceFlows: ParsedNode[] = []

  // 解析所有流程元素
  const elementTypes = [
    'startEvent', 'endEvent', 'intermediateThrowEvent', 'intermediateCatchEvent', 'boundaryEvent',
    'task', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'businessRuleTask', 'sendTask', 'receiveTask',
    'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway',
    'subProcess', 'callActivity'
  ]

  elementTypes.forEach(type => {
    const elements = processElement.querySelectorAll(`bpmn\\:${type}, ${type}`)
    elements.forEach(el => {
      nodes.push(parseElement(el as Element))
    })
  })

  // 解析连线
  const flows = processElement.querySelectorAll('bpmn\\:sequenceFlow, sequenceFlow')
  flows.forEach(flow => {
    sequenceFlows.push(parseElement(flow as Element))
  })

  return {
    id: processId,
    name: processName,
    isExecutable,
    nodes,
    sequenceFlows
  }
}

// 解析所有节点（扁平列表）
export const parseAllNodes = (xmlString: string): ParsedNode[] => {
  const process = parseBpmnProcess(xmlString)
  if (!process) return []

  return [...process.nodes, ...process.sequenceFlows]
}

// 按类型分组节点
export const parseNodesByType = (xmlString: string): Record<string, ParsedNode[]> => {
  const nodes = parseAllNodes(xmlString)
  const grouped: Record<string, ParsedNode[]> = {}

  nodes.forEach(node => {
    const simpleType = node.type.replace('bpmn:', '')
    if (!grouped[simpleType]) {
      grouped[simpleType] = []
    }
    grouped[simpleType].push(node)
  })

  return grouped
}

function parseDurationSeconds(duration: string | undefined): number | undefined {
  if (!duration) return undefined
  const parts = duration.trim().split(':').map(Number)
  if (parts.some(n => Number.isNaN(n))) return undefined
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  const asNumber = parseFloat(duration)
  return Number.isFinite(asNumber) ? asNumber : undefined
}

const GRAPH_NODE_TYPES = [
  'startEvent', 'endEvent', 'parallelGateway', 'exclusiveGateway',
  'serviceTask', 'task', 'userTask', 'scriptTask'
]

function findNearestUpstreamServiceTask(
  startNodeId: string,
  taskIds: Set<string>,
  reverseAdjacency: Map<string, string[]>
): string | null {
  const queue = [startNodeId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (taskIds.has(current)) return current
    queue.push(...(reverseAdjacency.get(current) || []))
  }

  return null
}

function findSplitGateways(
  nodeTypes: Map<string, string>,
  adjacency: Map<string, string[]>
): string[] {
  return [...nodeTypes.entries()]
    .filter(([, type]) => type === 'bpmn:parallelGateway')
    .map(([id]) => id)
    .filter(id => (adjacency.get(id) || []).length >= 2)
}

/** 从 Split 网关沿路径累计 ServiceTask 深度（1 = 分支入口任务） */
function computeServiceTaskBranchDepth(
  splitGatewayIds: string[],
  adjacency: Map<string, string[]>,
  taskIds: Set<string>
): Map<string, number> {
  const depths = new Map<string, number>()
  if (splitGatewayIds.length === 0) return depths

  splitGatewayIds.forEach(splitId => {
    let frontier: Array<{ nodeId: string; taskDepth: number }> = (adjacency.get(splitId) || [])
      .map(nodeId => ({ nodeId, taskDepth: 0 }))
    const seen = new Set<string>()

    while (frontier.length > 0) {
      const nextFrontier: typeof frontier = []

      frontier.forEach(({ nodeId, taskDepth }) => {
        const stateKey = `${nodeId}:${taskDepth}`
        if (seen.has(stateKey)) return
        seen.add(stateKey)

        const currentTaskDepth = taskIds.has(nodeId) ? taskDepth + 1 : taskDepth
        if (taskIds.has(nodeId)) {
          const prev = depths.get(nodeId)
          if (prev === undefined || currentTaskDepth < prev) {
            depths.set(nodeId, currentTaskDepth)
          }
        }

        ;(adjacency.get(nodeId) || []).forEach(next => {
          nextFrontier.push({ nodeId: next, taskDepth: currentTaskDepth })
        })
      })

      frontier = nextFrontier
    }
  })

  return depths
}

function compareWaveNodeOrder(
  a: string,
  b: string,
  taskIds: Set<string>,
  branchDepths: Map<string, number>,
  taskIndex: Map<string, number>
): number {
  const aIsTask = taskIds.has(a)
  const bIsTask = taskIds.has(b)
  if (!aIsTask && bIsTask) return -1
  if (aIsTask && !bIsTask) return 1
  if (!aIsTask && !bIsTask) return 0

  const depthA = branchDepths.get(a) ?? Number.MAX_SAFE_INTEGER
  const depthB = branchDepths.get(b) ?? Number.MAX_SAFE_INTEGER
  if (depthA !== depthB) return depthA - depthB
  return (taskIndex.get(a) ?? 0) - (taskIndex.get(b) ?? 0)
}

function buildBranchAwareExecutionOrder(
  startIds: string[],
  adjacency: Map<string, string[]>,
  inDegree: Map<string, number>,
  taskIds: Set<string>,
  tasks: WorkflowTask[],
  nodeTypes: Map<string, string>
): string[] {
  const splitGateways = findSplitGateways(nodeTypes, adjacency)
  const branchDepths = computeServiceTaskBranchDepth(splitGateways, adjacency, taskIds)
  const taskIndex = new Map(tasks.map((task, index) => [task.id, index]))

  const executionOrder: string[] = []
  const visited = new Set<string>()
  const degree = new Map(inDegree)

  const collectReady = (seeds: string[]) => seeds
    .filter(id => (degree.get(id) || 0) <= 0 && !visited.has(id))
    .sort((a, b) => compareWaveNodeOrder(a, b, taskIds, branchDepths, taskIndex))

  let ready = collectReady(startIds)

  if (ready.length === 0) {
    ready = collectReady(tasks.map(t => t.id).filter(id => (degree.get(id) || 0) <= 0))
  }

  while (ready.length > 0) {
    const nextReady: string[] = []

    ready.forEach(current => {
      if (visited.has(current)) return
      visited.add(current)

      if (taskIds.has(current)) {
        executionOrder.push(current)
      }

      ;(adjacency.get(current) || []).forEach(next => {
        const nextDegree = (degree.get(next) || 0) - 1
        degree.set(next, nextDegree)
        if (nextDegree <= 0 && !visited.has(next)) {
          nextReady.push(next)
        }
      })
    })

    ready = nextReady.sort((a, b) => compareWaveNodeOrder(a, b, taskIds, branchDepths, taskIndex))
  }

  return executionOrder
}

function buildJoinBarrierTasks(
  joinGateways: string[],
  taskIds: Set<string>,
  reverseAdjacency: Map<string, string[]>
): Map<string, string[]> {
  const joinBarrierTasks = new Map<string, string[]>()

  joinGateways.forEach(joinId => {
    const barrierTasks: string[] = []
    const directPreds = reverseAdjacency.get(joinId) || []

    directPreds.forEach(predId => {
      const taskId = taskIds.has(predId)
        ? predId
        : findNearestUpstreamServiceTask(predId, taskIds, reverseAdjacency)
      if (taskId && !barrierTasks.includes(taskId)) {
        barrierTasks.push(taskId)
      }
    })

    if (barrierTasks.length > 0) {
      joinBarrierTasks.set(joinId, barrierTasks)
    }
  })

  return joinBarrierTasks
}

/**
 * 解析 FFmpeg 工作流图：收集 ServiceTask 配置并按拓扑 + 分支深度排序执行顺序。
 * 从 Split 网关出发按层调度，保证各分支入口先于更深层的操作执行。
 */
export function parseWorkflowGraph(xmlString: string): WorkflowGraph | null {
  const doc = parseXmlToDoc(xmlString)
  if (!doc) return null

  const processElement = doc.querySelector('bpmn\\:process, process')
  if (!processElement) return null

  const processId = processElement.getAttribute('id') || 'Process_1'

  const serviceTasks = processElement.querySelectorAll('bpmn\\:serviceTask, serviceTask')
  if (serviceTasks.length === 0) return null

  const tasks: WorkflowTask[] = []
  serviceTasks.forEach(el => {
    const element = el as Element
    tasks.push({
      id: element.getAttribute('id') || '',
      name: element.getAttribute('name') || undefined,
      ffmpegConfig: parseFfmpegConfigFromXmlElement(element)
    })
  })

  const taskIds = new Set(tasks.map(t => t.id))

  const flowElements = processElement.querySelectorAll('bpmn\\:sequenceFlow, sequenceFlow')
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  const ensureNode = (id: string) => {
    if (!adjacency.has(id)) adjacency.set(id, [])
    if (!inDegree.has(id)) inDegree.set(id, 0)
  }

  flowElements.forEach(flow => {
    const sourceRef = flow.getAttribute('sourceRef')
    const targetRef = flow.getAttribute('targetRef')
    if (!sourceRef || !targetRef) return

    ensureNode(sourceRef)
    ensureNode(targetRef)
    adjacency.get(sourceRef)!.push(targetRef)
    inDegree.set(targetRef, (inDegree.get(targetRef) || 0) + 1)
  })

  tasks.forEach(t => ensureNode(t.id))

  const startEvents = processElement.querySelectorAll('bpmn\\:startEvent, startEvent')
  const startIds: string[] = []
  startEvents.forEach(el => {
    const id = el.getAttribute('id')
    if (id) startIds.push(id)
  })

  const nodeTypes = new Map<string, string>()
  GRAPH_NODE_TYPES.forEach(type => {
    const elements = processElement.querySelectorAll(`bpmn\\:${type}, ${type}`)
    elements.forEach(el => {
      const id = el.getAttribute('id')
      if (id) nodeTypes.set(id, `bpmn:${type}`)
    })
  })

  const executionOrder = buildBranchAwareExecutionOrder(
    startIds.filter(id => (inDegree.get(id) || 0) === 0),
    adjacency,
    inDegree,
    taskIds,
    tasks,
    nodeTypes
  )

  if (executionOrder.length === 0) return null

  const reverseAdjacency = new Map<string, string[]>()
  flowElements.forEach(flow => {
    const sourceRef = flow.getAttribute('sourceRef')
    const targetRef = flow.getAttribute('targetRef')
    if (!sourceRef || !targetRef) return
    if (!reverseAdjacency.has(targetRef)) reverseAdjacency.set(targetRef, [])
    reverseAdjacency.get(targetRef)!.push(sourceRef)
  })

  const joinGateways = [...nodeTypes.entries()]
    .filter(([id, type]) => type === 'bpmn:parallelGateway')
    .map(([id]) => id)
    .filter(id => (reverseAdjacency.get(id) || []).length >= 2)

  const joinBarrierTasks = buildJoinBarrierTasks(joinGateways, taskIds, reverseAdjacency)

  return {
    processId,
    tasks,
    executionOrder,
    reverseAdjacency,
    nodeTypes,
    joinGateways,
    joinBarrierTasks
  }
}

export { parseDurationSeconds }

// 获取节点的可读类型名称
export const getNodeTypeName = (type: string): string => {
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
    'bpmn:SubProcess': '子流程',
    'bpmn:CallActivity': '调用活动'
  }
  return typeNames[type] || type
}

// 更新XML中的节点名称
export const updateNodeNameInXml = (xmlString: string, nodeId: string, newName: string): string => {
  const doc = parseXmlToDoc(xmlString)
  if (!doc) return xmlString

  const element = doc.getElementById(nodeId)
  if (element) {
    element.setAttribute('name', newName)
  }

  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

// 更新XML中的节点ID
export const updateNodeIdInXml = (xmlString: string, oldId: string, newId: string): string => {
  const doc = parseXmlToDoc(xmlString)
  if (!doc) return xmlString

  const element = doc.getElementById(oldId)
  if (element) {
    element.setAttribute('id', newId)
    
    // 更新所有引用该ID的地方
    const allElements = doc.querySelectorAll('*')
    allElements.forEach(el => {
      if (el.getAttribute('sourceRef') === oldId) {
        el.setAttribute('sourceRef', newId)
      }
      if (el.getAttribute('targetRef') === oldId) {
        el.setAttribute('targetRef', newId)
      }
      if (el.getAttribute('bpmnElement') === oldId) {
        el.setAttribute('bpmnElement', newId)
      }
    })
  }

  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

// 格式化XML - 使用更安全的方法，避免破坏XML结构
export const formatXml = (xml: string): string => {
  try {
    const doc = parseXmlToDoc(xml)
    if (!doc) return xml

    // 验证XML结构是否完整
    const definitions = doc.querySelector('bpmn\\:definitions, definitions')
    const process = doc.querySelector('bpmn\\:process, process')
    
    if (!definitions || !process) {
      console.warn('XML结构不完整，跳过格式化')
      return xml
    }

    // 使用XMLSerializer序列化，保持原始结构和命名空间
    const serializer = new XMLSerializer()
    const serialized = serializer.serializeToString(doc)
    
    // 提取原始XML声明（如果有的话）
    const xmlDeclarationMatch = xml.match(/^<\?xml[^?]*\?>\s*/i)
    const xmlDeclaration = xmlDeclarationMatch ? xmlDeclarationMatch[0] : ''
    
    // 简单的格式化：只在标签之间添加换行，不改变其他结构
    // 使用更精确的正则表达式，避免破坏属性值中的内容
    let formatted = serialized
    
    // 只在闭合标签和开始标签之间添加换行
    formatted = formatted.replace(/>\s*</g, '>\n<')
    
    // 添加缩进
    let indent = 0
    const lines = formatted.split('\n')
    const result: string[] = []
    
    lines.forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) return
      
      // 结束标签减少缩进
      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1)
      }
      
      // 添加当前行（带缩进）
      result.push('  '.repeat(indent) + trimmed)
      
      // 开始标签增加缩进（但不是自闭合标签、XML声明或包含子标签的标签）
      if (trimmed.startsWith('<') && 
          !trimmed.startsWith('</') && 
          !trimmed.startsWith('<?') &&  // 不处理XML声明
          !trimmed.endsWith('/>') && 
          !trimmed.includes('</')) {
        indent++
      }
    })
    
    // 组合结果，保留原始XML声明
    const formattedContent = result.join('\n')
    return xmlDeclaration + formattedContent
  } catch (error) {
    console.error('格式化XML失败:', error)
    // 格式化失败时返回原始XML，避免破坏结构
    return xml
  }
}

// 验证XML格式
export const validateXml = (xml: string): { valid: boolean; error?: string } => {
  const doc = parseXmlToDoc(xml)
  if (!doc) {
    return { valid: false, error: 'XML格式无效' }
  }

  // 检查必要的BPMN元素
  const definitions = doc.querySelector('bpmn\\:definitions, definitions')
  if (!definitions) {
    return { valid: false, error: '缺少bpmn:definitions根元素' }
  }

  const process = doc.querySelector('bpmn\\:process, process')
  if (!process) {
    return { valid: false, error: '缺少bpmn:process元素' }
  }

  return { valid: true }
}

// 生成新的唯一ID：节点名称_随机6位数
const generateNewId = (elementName: string): string => {
  const randomNum = Math.floor(100000 + Math.random() * 900000)
  // 清理名称中的特殊字符，保留中文、英文、数字
  const sanitizedName = elementName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')
    .substring(0, 20) // 限制长度
  return `${sanitizedName}_${randomNum}`
}

// 为新增的元素生成新ID，保留已有元素的ID
// 使用字符串替换方法，避免XMLSerializer改变XML结构
export const generateNewIdsForNewElements = (newXml: string, existingXml: string): string => {
  const newDoc = parseXmlToDoc(newXml)
  const existingDoc = parseXmlToDoc(existingXml)
  
  if (!newDoc || !existingDoc) return newXml

  // 收集已有XML中的所有ID
  const existingIds = new Set<string>()
  const existingElements = existingDoc.querySelectorAll('[id]')
  existingElements.forEach(el => {
    const id = el.getAttribute('id')
    if (id) existingIds.add(id)
  })

  const idMapping = new Map<string, string>() // 旧ID -> 新ID

  // 检查新XML中的每个元素
  const newElements = newDoc.querySelectorAll('[id]')
  newElements.forEach(element => {
    const oldId = element.getAttribute('id')
    if (!oldId) return

    // 如果ID已存在于画布中，需要生成新ID
    if (existingIds.has(oldId)) {
      // 获取元素名称，如果没有名称则使用元素类型
      let elementName = element.getAttribute('name') || ''
      
      // 如果没有名称，根据元素类型生成默认名称
      if (!elementName) {
        const tagName = element.tagName.replace('bpmn:', '')
        const typeNames: Record<string, string> = {
          'process': '流程',
          'startEvent': '开始',
          'endEvent': '结束',
          'task': '任务',
          'userTask': '用户任务',
          'serviceTask': '服务任务',
          'exclusiveGateway': '排他网关',
          'parallelGateway': '并行网关',
          'sequenceFlow': '连线',
          'BPMNShape': '图形',
          'BPMNEdge': '连线图形',
          'BPMNPlane': '平面',
          'BPMNDiagram': '图表'
        }
        elementName = typeNames[tagName] || tagName
      }

      // 生成新ID
      const newId = generateNewId(elementName)
      idMapping.set(oldId, newId)
    }
  })

  // 如果没有ID冲突，直接返回原始XML
  if (idMapping.size === 0) {
    return newXml
  }

  // 使用字符串替换来修改ID，避免使用XMLSerializer破坏XML结构
  let result = newXml
  
  // 按照ID长度降序排序，避免短ID替换长ID的一部分
  const sortedMappings = Array.from(idMapping.entries())
    .sort((a, b) => b[0].length - a[0].length)
  
  for (const [oldId, newId] of sortedMappings) {
    // 替换 id="xxx" 属性
    const idAttrRegex = new RegExp(`id="${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
    result = result.replace(idAttrRegex, `id="${newId}"`)
    
    // 替换 sourceRef="xxx" 属性
    const sourceRefRegex = new RegExp(`sourceRef="${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
    result = result.replace(sourceRefRegex, `sourceRef="${newId}"`)
    
    // 替换 targetRef="xxx" 属性
    const targetRefRegex = new RegExp(`targetRef="${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
    result = result.replace(targetRefRegex, `targetRef="${newId}"`)
    
    // 替换 bpmnElement="xxx" 属性
    const bpmnElementRegex = new RegExp(`bpmnElement="${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
    result = result.replace(bpmnElementRegex, `bpmnElement="${newId}"`)
    
    // 替换 processRef="xxx" 属性
    const processRefRegex = new RegExp(`processRef="${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')
    result = result.replace(processRefRegex, `processRef="${newId}"`)
    
    // 替换 <bpmn:incoming>xxx</bpmn:incoming> 和 <incoming>xxx</incoming>
    const incomingRegex = new RegExp(`(<bpmn:incoming>|<incoming>)${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</bpmn:incoming>|</incoming>)`, 'g')
    result = result.replace(incomingRegex, `$1${newId}$2`)
    
    // 替换 <bpmn:outgoing>xxx</bpmn:outgoing> 和 <outgoing>xxx</outgoing>
    const outgoingRegex = new RegExp(`(<bpmn:outgoing>|<outgoing>)${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(</bpmn:outgoing>|</outgoing>)`, 'g')
    result = result.replace(outgoingRegex, `$1${newId}$2`)
  }
  
  return result
}
