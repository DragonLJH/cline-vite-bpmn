import ContextPadProvider from 'bpmn-js/lib/features/context-pad/ContextPadProvider'
import { is } from 'bpmn-js/lib/util/ModelUtil'
import type { ContextPadEntries } from 'diagram-js/lib/features/context-pad/ContextPadProvider'

class FfmpegContextPadProvider extends ContextPadProvider {
  getContextPadEntries(element: any): ContextPadEntries {
    const entries = super.getContextPadEntries(element) as ContextPadEntries
    const filtered: ContextPadEntries = {}

    if (entries.delete) filtered.delete = entries.delete
    if (entries.connect) filtered.connect = entries.connect

    if (this.shouldShowServiceTaskAppend(element)) {
      filtered['append.service-task'] = this.createServiceTaskAppendEntry(element)
    }

    if (this.shouldShowBranchAppend(element)) {
      filtered['append.branch-processing'] = this.createBranchAppendEntry(element)
    }

    if (this.shouldShowParallelGatewayAppend(element)) {
      filtered['append.parallel-gateway'] = this.createParallelGatewayAppendEntry(element)
    }

    return filtered
  }

  shouldShowServiceTaskAppend(element: any): boolean {
    const businessObject = element.businessObject

    if (!is(businessObject, 'bpmn:FlowNode')) return false
    if (is(businessObject, 'bpmn:EndEvent')) return false
    if (is(businessObject, 'bpmn:EventBasedGateway')) return false
    if (businessObject.isForCompensation) return false

    return true
  }

  shouldShowBranchAppend(element: any): boolean {
    const businessObject = element.businessObject

    if (!is(businessObject, 'bpmn:ServiceTask')) return false
    if (businessObject.isForCompensation) return false

    return true
  }

  shouldShowParallelGatewayAppend(element: any): boolean {
    const businessObject = element.businessObject

    if (!is(businessObject, 'bpmn:FlowNode')) return false
    if (is(businessObject, 'bpmn:EndEvent')) return false
    if (is(businessObject, 'bpmn:EventBasedGateway')) return false
    if (businessObject.isForCompensation) return false

    return true
  }

  createShapeAppendEntry(element: any, shapeType: string, className: string, title: string) {
    const elementFactory = (this as any)._elementFactory
    const create = (this as any)._create
    const autoPlace = (this as any)._autoPlace
    const appendPreview = (this as any)._appendPreview

    function appendStart(event: Event, source: any) {
      const shape = elementFactory.createShape({ type: shapeType })
      create.start(event, shape, { source })
    }

    const append = autoPlace
      ? (_: Event, source: any) => {
          const shape = elementFactory.createShape({ type: shapeType })
          autoPlace.append(source, shape)
        }
      : appendStart

    const previewAppend = autoPlace
      ? (_: Event, source: any) => {
          appendPreview.create(source, shapeType)
          return () => appendPreview.cleanUp()
        }
      : null

    const action: Record<string, any> = {
      dragstart: appendStart,
      click: append
    }

    if (previewAppend) {
      action.hover = previewAppend
    }

    return {
      group: 'model',
      className,
      title,
      action
    }
  }

  createNamedShape(shapeType: string, name: string) {
    const elementFactory = (this as any)._elementFactory
    const shape = elementFactory.createShape({ type: shapeType })

    if (shape.businessObject) {
      shape.businessObject.name = name
    }

    return shape
  }

  createBranchAppendEntry(element: any) {
    const modeling = (this as any)._modeling
    const canvas = (this as any)._canvas

    const appendBranch = (_: Event, source: any) => {
      const parent = source.parent || canvas.getRootElement()
      const sourceCenterY = source.y + source.height / 2
      const gatewayCenter = {
        x: source.x + source.width + 95,
        y: sourceCenterY
      }
      const branchTaskX = gatewayCenter.x + 170
      const branchOffsetY = 75

      const gateway = this.createNamedShape('bpmn:ParallelGateway', '分支')
      const branchA = this.createNamedShape('bpmn:ServiceTask', '分支A')
      const branchB = this.createNamedShape('bpmn:ServiceTask', '分支B')

      const createdGateway = modeling.createShape(gateway, gatewayCenter, parent)
      const createdBranchA = modeling.createShape(branchA, {
        x: branchTaskX,
        y: sourceCenterY - branchOffsetY
      }, parent)
      const createdBranchB = modeling.createShape(branchB, {
        x: branchTaskX,
        y: sourceCenterY + branchOffsetY
      }, parent)

      modeling.connect(source, createdGateway)
      modeling.connect(createdGateway, createdBranchA)
      modeling.connect(createdGateway, createdBranchB)
    }

    return {
      group: 'model',
      className: 'bpmn-icon-gateway-parallel',
      title: '追加分支处理',
      action: {
        click: appendBranch
      }
    }
  }

  createServiceTaskAppendEntry(element: any) {
    return this.createShapeAppendEntry(
      element,
      'bpmn:ServiceTask',
      'bpmn-icon-service-task',
      '追加 FFmpeg 服务任务'
    )
  }

  createParallelGatewayAppendEntry(element: any) {
    return this.createShapeAppendEntry(
      element,
      'bpmn:ParallelGateway',
      'bpmn-icon-gateway-parallel',
      '追加汇合网关'
    )
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
