import { parseXmlToDoc } from '../../utils/bpmnParser'
import { parseFfmpegConfigFromXmlElement } from './configCodec'
import { serializeFfmpegJobConfig, type FfmpegJobConfig } from './jobConfig'

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const FFMPEG_NS = 'http://cline-vite-bpmn/schema/ffmpeg'

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function createBpmnElement(doc: Document, localName: string): Element {
  return doc.createElementNS(BPMN_NS, `bpmn:${localName}`)
}

function getChildTextRefs(element: Element, localName: string): string[] {
  const refs: string[] = []
  for (let i = 0; i < element.childNodes.length; i += 1) {
    const child = element.childNodes[i]
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === localName) {
      const text = child.textContent?.trim()
      if (text) refs.push(text)
    }
  }
  return refs
}

function setChildTextRefs(element: Element, localName: string, refs: string[]) {
  const toRemove: Element[] = []
  for (let i = 0; i < element.childNodes.length; i += 1) {
    const child = element.childNodes[i]
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === localName) {
      toRemove.push(child as Element)
    }
  }
  toRemove.forEach(node => element.removeChild(node))
  refs.forEach(ref => {
    const el = createBpmnElement(element.ownerDocument!, localName)
    el.textContent = ref
    element.appendChild(el)
  })
}

function findFfmpegConfigElement(serviceTask: Element): Element | null {
  const lowerCase = serviceTask.getElementsByTagNameNS(FFMPEG_NS, 'config')
  if (lowerCase.length > 0) return lowerCase[0]
  const extensionElements = serviceTask.querySelector('extensionElements, bpmn\\:extensionElements')
  if (extensionElements) {
    const configs = extensionElements.querySelectorAll('ffmpeg\\:config, config')
    if (configs.length > 0) return configs[0] as Element
  }
  return null
}

function writeFfmpegConfig(serviceTask: Element, config: FfmpegJobConfig) {
  const json = escapeXmlAttr(serializeFfmpegJobConfig(config))
  const configEl = findFfmpegConfigElement(serviceTask)
  if (configEl) {
    configEl.setAttribute('json', json)
    return
  }
  let extensionElements = serviceTask.querySelector('extensionElements, bpmn\\:extensionElements') as Element | null
  if (!extensionElements) {
    extensionElements = createBpmnElement(serviceTask.ownerDocument!, 'extensionElements')
    serviceTask.insertBefore(extensionElements, serviceTask.firstChild)
  }
  const configElement = serviceTask.ownerDocument!.createElementNS(FFMPEG_NS, 'ffmpeg:config')
  configElement.setAttribute('json', json)
  extensionElements.appendChild(configElement)
}

function isServiceTask(doc: Document, nodeId: string): boolean {
  const el = doc.getElementById(nodeId)
  if (!el) return false
  return el.localName === 'serviceTask'
}

function hasUpstreamServiceTask(doc: Document, taskId: string, flows: Element[]): boolean {
  const reverse = new Map<string, string[]>()
  flows.forEach(flow => {
    const source = flow.getAttribute('sourceRef')
    const target = flow.getAttribute('targetRef')
    if (!source || !target) return
    if (!reverse.has(target)) reverse.set(target, [])
    reverse.get(target)!.push(source)
  })

  const queue = [...(reverse.get(taskId) || [])]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (isServiceTask(doc, current)) return true
    queue.push(...(reverse.get(current) || []))
  }
  return false
}

function isGateway(doc: Document, nodeId: string): boolean {
  const el = doc.getElementById(nodeId)
  if (!el) return false
  return el.localName === 'parallelGateway' || el.localName === 'exclusiveGateway'
}

function entryPassThroughConfig(taskId: string): FfmpegJobConfig {
  const safeId = taskId.replace(/[^a-zA-Z0-9_]/g, '_')
  return {
    type: 'ffmpeg',
    action: 'transcode',
    input: { source: 'input' },
    output: { format: 'mp4', overwrite: true, var: `${safeId}.output` },
    video: { codec: 'copy' },
    audio: { codec: 'copy' },
    global: { hideBanner: true, noStdin: true }
  }
}

function renameFromProbe(name: string | null, fallback: string): string {
  if (!name) return fallback
  return name
    .replace(/^探测分支/, '分支')
    .replace(/^探测信息$/, '输入')
    .replace(/^探测/, '')
    .trim() || fallback
}

function removeDiagramElements(doc: Document, bpmnElementIds: string[]) {
  const idSet = new Set(bpmnElementIds)
  const shapes = doc.querySelectorAll('[bpmnElement]')
  shapes.forEach(el => {
    const ref = el.getAttribute('bpmnElement')
    if (ref && idSet.has(ref)) {
      el.parentNode?.removeChild(el)
    }
  })
}

let flowCounter = 0
function nextFlowId(): string {
  flowCounter += 1
  return `Flow_migrated_${Date.now()}_${flowCounter}`
}

export interface ProbeMigrationResult {
  xml: string
  migrated: boolean
}

/**
 * 打开 BPMN 时迁移废弃的 probe 节点：
 * - 入口 probe（无上游 ServiceTask）：转为 stream copy 转码，或删除并令后继改用 input
 * - 中间 probe：删除节点并重连前后连线
 */
export function migrateProbeNodesFromBpmnXml(xmlString: string): ProbeMigrationResult {
  flowCounter = 0
  const doc = parseXmlToDoc(xmlString)
  if (!doc) return { xml: xmlString, migrated: false }

  const processElement = doc.querySelector('bpmn\\:process, process')
  if (!processElement) return { xml: xmlString, migrated: false }

  const serviceTasks = Array.from(processElement.querySelectorAll('bpmn\\:serviceTask, serviceTask')) as Element[]

  const probeTasks = serviceTasks.filter(task => {
    const config = parseFfmpegConfigFromXmlElement(task)
    return config.action === 'probe'
  })

  if (probeTasks.length === 0) {
    return { xml: xmlString, migrated: false }
  }

  const removedIds: string[] = []

  probeTasks.forEach(probeTask => {
    const probeId = probeTask.getAttribute('id')
    if (!probeId) return

    const flows = Array.from(processElement.querySelectorAll('bpmn\\:sequenceFlow, sequenceFlow')) as Element[]
    const config = parseFfmpegConfigFromXmlElement(probeTask)
    const inputSource = config.input?.source ?? 'input'
    const isEntry = inputSource === 'input' && !hasUpstreamServiceTask(doc, probeId, flows)

    const incomingFlows = flows.filter(f => f.getAttribute('targetRef') === probeId)
    const outgoingFlows = flows.filter(f => f.getAttribute('sourceRef') === probeId)
    const predecessorIds = incomingFlows.map(f => f.getAttribute('sourceRef')).filter(Boolean) as string[]
    const successorIds = outgoingFlows.map(f => f.getAttribute('targetRef')).filter(Boolean) as string[]

    const isBranchEntry = isEntry && predecessorIds.some(id => isGateway(doc, id))

    if (isBranchEntry || (isEntry && successorIds.length === 0)) {
      writeFfmpegConfig(probeTask, entryPassThroughConfig(probeId))
      const currentName = probeTask.getAttribute('name')
      probeTask.setAttribute('name', renameFromProbe(currentName, '分支输入'))
      return
    }

    if (isEntry && successorIds.length === 1) {
      const successorEl = doc.getElementById(successorIds[0])
      if (successorEl) {
        const successorConfig = parseFfmpegConfigFromXmlElement(successorEl)
        if ((successorConfig.input?.source ?? 'input') === 'prev') {
          writeFfmpegConfig(successorEl, {
            ...successorConfig,
            input: { ...successorConfig.input, source: 'input' }
          })
        }
      }
    }

    incomingFlows.forEach(flow => {
      const flowId = flow.getAttribute('id')
      if (flowId) removedIds.push(flowId)
      flow.parentNode?.removeChild(flow)
    })
    outgoingFlows.forEach(flow => {
      const flowId = flow.getAttribute('id')
      if (flowId) removedIds.push(flowId)
      flow.parentNode?.removeChild(flow)
    })

    predecessorIds.forEach(predId => {
      const predEl = doc.getElementById(predId)
      if (!predEl) return
      const outRefs = getChildTextRefs(predEl, 'outgoing')
        .filter(ref => !incomingFlows.some(f => f.getAttribute('id') === ref))
      setChildTextRefs(predEl, 'outgoing', outRefs)
    })

    successorIds.forEach(succId => {
      const succEl = doc.getElementById(succId)
      if (!succEl) return
      const inRefs = getChildTextRefs(succEl, 'incoming')
        .filter(ref => !outgoingFlows.some(f => f.getAttribute('id') === ref))
      setChildTextRefs(succEl, 'incoming', inRefs)
    })

    predecessorIds.forEach(predId => {
      successorIds.forEach(succId => {
        const flowId = nextFlowId()
        const flowEl = createBpmnElement(doc, 'sequenceFlow')
        flowEl.setAttribute('id', flowId)
        flowEl.setAttribute('sourceRef', predId)
        flowEl.setAttribute('targetRef', succId)
        processElement.appendChild(flowEl)

        const predEl = doc.getElementById(predId)
        const succEl = doc.getElementById(succId)
        if (predEl) {
          setChildTextRefs(predEl, 'outgoing', [...getChildTextRefs(predEl, 'outgoing'), flowId])
        }
        if (succEl) {
          setChildTextRefs(succEl, 'incoming', [...getChildTextRefs(succEl, 'incoming'), flowId])
        }
      })
    })

    removedIds.push(probeId)
    probeTask.parentNode?.removeChild(probeTask)
  })

  removeDiagramElements(doc, removedIds)

  const serializer = new XMLSerializer()
  return { xml: serializer.serializeToString(doc), migrated: true }
}

export function applyProbeMigrationToBpmnXml(xmlString: string): string {
  return migrateProbeNodesFromBpmnXml(xmlString).xml
}
