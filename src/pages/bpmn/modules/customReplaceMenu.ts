import ReplaceMenuProvider from 'bpmn-js/lib/features/popup-menu/ReplaceMenuProvider'
import { is } from 'bpmn-js/lib/util/ModelUtil'

class FfmpegReplaceMenuProvider extends ReplaceMenuProvider {
  getPopupMenuEntries(target: any) {
    if (!target || Array.isArray(target)) {
      return {}
    }

    const businessObject = target.businessObject
    const allEntries = super.getPopupMenuEntries(target) as Record<string, unknown>

    if (is(businessObject, 'bpmn:StartEvent') || is(businessObject, 'bpmn:EndEvent')) {
      return {}
    }

    if (
      is(businessObject, 'bpmn:Gateway') ||
      is(businessObject, 'bpmn:IntermediateThrowEvent') ||
      is(businessObject, 'bpmn:IntermediateCatchEvent') ||
      is(businessObject, 'bpmn:SequenceFlow') ||
      is(businessObject, 'bpmn:SubProcess') ||
      is(businessObject, 'bpmn:Participant')
    ) {
      return {}
    }

    if (is(businessObject, 'bpmn:FlowNode')) {
      const serviceTaskEntry = allEntries['replace-with-service-task']
      if (serviceTaskEntry) {
        return {
          'replace-with-service-task': serviceTaskEntry
        }
      }
      return {}
    }

    return {}
  }

  getPopupMenuHeaderEntries(_target: any) {
    return {}
  }
}

FfmpegReplaceMenuProvider.$inject = [
  'bpmnFactory',
  'popupMenu',
  'modeling',
  'moddle',
  'bpmnReplace',
  'rules',
  'translate',
  'moddleCopy'
]

export default {
  __init__: ['replaceMenuProvider'],
  replaceMenuProvider: ['type', FfmpegReplaceMenuProvider]
}
