import PaletteProvider from 'bpmn-js/lib/features/palette/PaletteProvider'

const ALLOWED_CREATE_ENTRIES = new Set([
  'hand-tool',
  'lasso-tool',
  'space-tool',
  'global-connect-tool',
  'tool-separator'
])

class FfmpegPaletteProvider extends PaletteProvider {
  getPaletteEntries() {
    const entries = super.getPaletteEntries() as Record<string, unknown>
    const filtered: Record<string, unknown> = {}

    Object.keys(entries).forEach(key => {
      if (ALLOWED_CREATE_ENTRIES.has(key)) {
        filtered[key] = entries[key]
      }
    })

    const create = (this as any)._create
    const elementFactory = (this as any)._elementFactory

    function createServiceTask(event: Event) {
      const shape = elementFactory.createShape({ type: 'bpmn:ServiceTask' })
      create.start(event, shape)
    }

    function createParallelGateway(event: Event) {
      const shape = elementFactory.createShape({ type: 'bpmn:ParallelGateway' })
      create.start(event, shape)
    }

    filtered['create.service-task'] = {
      group: 'activity',
      className: 'bpmn-icon-service-task',
      title: '创建 FFmpeg 服务任务',
      action: {
        dragstart: createServiceTask,
        click: createServiceTask
      }
    }

    filtered['create.parallel-gateway'] = {
      group: 'gateway',
      className: 'bpmn-icon-gateway-parallel',
      title: '创建并行网关',
      action: {
        dragstart: createParallelGateway,
        click: createParallelGateway
      }
    }

    return filtered
  }
}

FfmpegPaletteProvider.$inject = [
  'palette',
  'create',
  'elementFactory',
  'spaceTool',
  'lassoTool',
  'handTool',
  'globalConnect',
  'translate'
]

export default {
  __init__: ['paletteProvider'],
  paletteProvider: ['type', FfmpegPaletteProvider]
}
