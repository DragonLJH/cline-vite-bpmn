import { assign } from 'min-dash'
import ContextPadProvider from 'bpmn-js/lib/features/context-pad/ContextPadProvider'
import { is } from 'bpmn-js/lib/util/ModelUtil'

class FfmpegContextPadProvider extends ContextPadProvider {
  getContextPadEntries(element: any) {
    const entries = super.getContextPadEntries(element) as Record<string, unknown>
    const filtered: Record<string, unknown> = {}

    if (entries.delete) filtered.delete = entries.delete
    if (entries.connect) filtered.connect = entries.connect

    if (this.shouldShowServiceTaskAppend(element)) {
      filtered['append.service-task'] = this.createServiceTaskAppendEntry(element)
    }

    return filtered
  }

  shouldShowServiceTaskAppend(element: any): boolean {
    const businessObject = element.businessObject

    if (!is(businessObject, 'bpmn:FlowNode')) return false
    if (is(businessObject, 'bpmn:EventBasedGateway')) return false
    if (businessObject.isForCompensation) return false

    return true
  }

  createServiceTaskAppendEntry(element: any) {
    const elementFactory = (this as any)._elementFactory
    const create = (this as any)._create
    const autoPlace = (this as any)._autoPlace
    const appendPreview = (this as any)._appendPreview

    function appendStart(event: Event, source: any) {
      const shape = elementFactory.createShape({ type: 'bpmn:ServiceTask' })
      create.start(event, shape, { source })
    }

    const append = autoPlace
      ? (_: Event, source: any) => {
          const shape = elementFactory.createShape({ type: 'bpmn:ServiceTask' })
          autoPlace.append(source, shape)
        }
      : appendStart

    const previewAppend = autoPlace
      ? (_: Event, source: any) => {
          appendPreview.create(source, 'bpmn:ServiceTask')
          return () => appendPreview.cleanUp()
        }
      : null

    return {
      group: 'model',
      className: 'bpmn-icon-service-task',
      title: '追加 FFmpeg 服务任务',
      action: assign(
        {
          dragstart: appendStart,
          click: append
        },
        previewAppend ? { hover: previewAppend } : {}
      )
    }
  }
}

FfmpegContextPadProvider.$inject = [
  'config.contextPad',
  'injector',
  'eventBus',
  'contextPad',
  'modeling',
  'elementFactory',
  'connect',
  'create',
  'popupMenu',
  'canvas',
  'rules',
  'translate',
  'appendPreview'
]

export default {
  __init__: ['contextPadProvider'],
  contextPadProvider: ['type', FfmpegContextPadProvider]
}
