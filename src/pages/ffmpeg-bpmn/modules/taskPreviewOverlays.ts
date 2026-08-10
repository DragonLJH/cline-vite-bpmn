import type { NodePreviewState } from '../../../stores/ffmpegBpmnStore'
import { useFfmpegBpmnStore } from '../../../stores/ffmpegBpmnStore'

const OVERLAY_TYPE_PREFIX = 'task-preview-'

function createOverlayHtml(preview: NodePreviewState, taskName?: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'ffmpeg-task-preview-overlay'

  if (preview.kind === 'loading') {
    root.classList.add('ffmpeg-task-preview-overlay--loading')
    root.innerHTML = '<span class="ffmpeg-task-preview-overlay__spinner" aria-hidden="true"></span>'
    return root
  }

  if (preview.kind === 'error') {
    root.classList.add('ffmpeg-task-preview-overlay--error')
    root.title = preview.error || '预览失败'
    root.textContent = preview.error ? '!' : '!'
    return root
  }

  if (!preview.dataUrl) {
    root.classList.add('ffmpeg-task-preview-overlay--empty')
    root.textContent = '无预览'
    return root
  }

  const img = document.createElement('img')
  img.src = preview.dataUrl
  img.alt = taskName ? `${taskName} 预览` : '任务预览'
  img.draggable = false
  img.className = 'ffmpeg-task-preview-overlay__img'
  root.appendChild(img)

  if (preview.kind === 'audio') {
    const badge = document.createElement('span')
    badge.className = 'ffmpeg-task-preview-overlay__badge'
    badge.textContent = 'AUDIO'
    root.appendChild(badge)
  }

  return root
}

class TaskPreviewOverlays {
  private overlays: any
  private elementRegistry: any
  private overlayIds: Map<string, string>

  static $inject = ['eventBus', 'overlays', 'elementRegistry']

  constructor(eventBus: any, overlays: any, elementRegistry: any) {
    this.overlays = overlays
    this.elementRegistry = elementRegistry
    this.overlayIds = new Map()

    eventBus.on('import.done', () => {
      setTimeout(() => {
        void useFfmpegBpmnStore.getState().ensureAllEntryNodePreviews()
      }, 0)
    })

    eventBus.on('nodePreview.updated', () => {
      this.syncAll()
    })

    eventBus.on('shape.added', 500, (event: { element: any }) => {
      this.syncElement(event.element)
    })

    eventBus.on('shape.removed', (event: { element: any }) => {
      this.removeOverlayForElement(event.element)
    })

    eventBus.on('diagram.destroy', () => {
      this.destroy()
    })

    this.syncAll()
  }

  private overlayType(elementId: string): string {
    return `${OVERLAY_TYPE_PREFIX}${elementId}`
  }

  private removeOverlayForElement(element: any) {
    if (!element?.id || element.type !== 'bpmn:ServiceTask') return
    const overlayType = this.overlayType(element.id)
    this.overlays.remove({ element, type: overlayType })
    this.overlayIds.delete(element.id)
  }

  private upsertOverlay(element: any, preview: NodePreviewState) {
    const overlayType = this.overlayType(element.id)
    const html = createOverlayHtml(preview, element.businessObject?.name)

    this.overlays.remove({ element, type: overlayType })
    this.overlays.add(element, overlayType, {
      position: {
        top: 26,
        left: 8
      },
      html,
      scale: true
    })
    this.overlayIds.set(element.id, overlayType)
  }

  private syncElement(element: any) {
    if (!element?.id || element.type !== 'bpmn:ServiceTask') return

    const preview = useFfmpegBpmnStore.getState().nodePreviews[element.id]
    if (!preview) {
      this.removeOverlayForElement(element)
      return
    }

    this.upsertOverlay(element, preview)
  }

  syncAll() {
    const previews = useFfmpegBpmnStore.getState().nodePreviews
    const activeIds = new Set<string>()

    this.elementRegistry.forEach((element: any) => {
      if (element.type !== 'bpmn:ServiceTask') return
      activeIds.add(element.id)

      const preview = previews[element.id]
      if (!preview) {
        this.removeOverlayForElement(element)
        return
      }

      this.upsertOverlay(element, preview)
    })

    Array.from(this.overlayIds.keys()).forEach(elementId => {
      if (!activeIds.has(elementId)) {
        const element = this.elementRegistry.get(elementId)
        if (element) {
          this.removeOverlayForElement(element)
        } else {
          this.overlayIds.delete(elementId)
        }
      }
    })
  }

  destroy() {
    this.overlayIds.clear()
  }
}

export default {
  __init__: ['taskPreviewOverlays'],
  taskPreviewOverlays: ['type', TaskPreviewOverlays]
}
