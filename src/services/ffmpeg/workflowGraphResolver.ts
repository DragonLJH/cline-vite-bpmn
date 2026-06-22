import type { FfmpegJobConfig, WorkflowGraph } from '../../types/bpmn'
import { readFfmpegConfigFromBusinessObject } from './configCodec'
import { parseWorkflowGraph } from '../../utils/bpmnParser'

export interface WorkflowRunContext {
  modeler?: {
    get: (name: string) => {
      get: (id: string) => { businessObject?: unknown } | undefined
    }
  } | null
  pendingConfigs?: Record<string, FfmpegJobConfig>
}

function resolveTaskConfig(
  taskId: string,
  xmlConfig: FfmpegJobConfig | undefined,
  context?: WorkflowRunContext
): FfmpegJobConfig | undefined {
  if (context?.pendingConfigs?.[taskId]) {
    return context.pendingConfigs[taskId]
  }

  if (context?.modeler) {
    try {
      const element = context.modeler.get('elementRegistry').get(taskId)
      if (element?.businessObject) {
        return readFfmpegConfigFromBusinessObject(element.businessObject)
      }
    } catch {
      // 回退 XML 配置
    }
  }

  return xmlConfig
}

export function resolveWorkflowGraphForRun(
  bpmnXml: string,
  context?: WorkflowRunContext
): WorkflowGraph | null {
  const graph = parseWorkflowGraph(bpmnXml)
  if (!graph) return null

  if (!context?.modeler && !context?.pendingConfigs) {
    return graph
  }

  return {
    ...graph,
    tasks: graph.tasks.map(task => ({
      ...task,
      ffmpegConfig: resolveTaskConfig(task.id, task.ffmpegConfig, context) || task.ffmpegConfig
    }))
  }
}
