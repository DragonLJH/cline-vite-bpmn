import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider'
import { is } from 'bpmn-js/lib/util/ModelUtil'

const ALLOWED_SHAPE_TYPES = new Set([
  'bpmn:ServiceTask',
  'bpmn:ParallelGateway',
  'bpmn:StartEvent',
  'bpmn:EndEvent',
  'bpmn:SequenceFlow',
  'bpmn:Process',
  'label'
])

const TASK_TYPES = new Set([
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:ManualTask',
  'bpmn:BusinessRuleTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask'
])

class FfmpegRules extends RuleProvider {
  constructor(eventBus: any) {
    super(eventBus)
  }

  init() {
    this.addRule('shape.create', 1500, (context: any) => {
      const shape = context.shape || context.element

      if (shape && TASK_TYPES.has(shape.type) && shape.type !== 'bpmn:ServiceTask') {
        return 'bpmn:ServiceTask'
      }

      if (shape && !ALLOWED_SHAPE_TYPES.has(shape.type)) {
        return false
      }

      return true
    })

    this.addRule('elements.create', 1500, (context: any) => {
      const elements = context.elements || []

      return elements.every((element: any) => {
        if (is(element, 'bpmn:Task') && !is(element, 'bpmn:ServiceTask')) {
          return false
        }
        return ALLOWED_SHAPE_TYPES.has(element.type) || element.type === 'bpmn:Participant'
      })
    })
  }
}

FfmpegRules.$inject = ['eventBus']

export default {
  __init__: ['ffmpegRules'],
  ffmpegRules: ['type', FfmpegRules]
}
