import React, { useEffect, useRef, useState, useCallback } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import type { BpmnElement } from '../../../../types/bpmn'
import { useFfmpegBpmnStore } from '../../../../stores/ffmpegBpmnStore'
import { useXmlSync, XmlDiffAnalyzer } from '../../../../utils/bpmnXmlSync'
import { DEFAULT_FFMPEG_CONFIG, persistFfmpegConfigToModel } from '../../../../services/ffmpeg/configCodec'
import ffmpegModdle from '../../../../moddle/ffmpeg.json'
import customPalette from '../../../bpmn/modules/customPalette'
import customContextPad from '../../../bpmn/modules/customContextPad'
import customRules from '../../../bpmn/modules/customRules'
import customReplaceMenu from '../../../bpmn/modules/customReplaceMenu'
import '../../../bpmn/components/BpmnDesigner/index.scss'

import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

interface FfmpegDesignerRef {
  getCanvas: () => any
  getSvg: () => Promise<string | null>
  importXml: (xml: string) => Promise<void>
  saveCurrentXml: () => Promise<void>
  syncXml: (newXml: string, options?: {
    preserveViewState?: boolean
    useSmartSync?: boolean
  }) => Promise<void>
  getPerformanceMetrics: () => any
}

interface FfmpegDesignerProps {
  className?: string
}

const XML_EXPORT_DEBOUNCE_MS = 150

const FfmpegDesigner = React.forwardRef<FfmpegDesignerRef, FfmpegDesignerProps>(({ className }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const modelerRef = useRef<BpmnModeler | null>(null)
  const [isModelerReady, setIsModelerReady] = useState(false)
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastModelerSyncTokenRef = useRef(0)

  const {
    bpmnXml,
    modelerXmlSyncToken,
    setBpmnXmlFromModeler,
    setSelectedElement,
    pushToUndoStack,
    zoomLevel,
    minimapOpen,
    setModelerRef
  } = useFfmpegBpmnStore()

  const xmlSyncManager = useXmlSync(modelerRef.current)

  const exportXmlFromModeler = useCallback(async () => {
    if (!modelerRef.current) return

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true })
      if (xml) {
        pushToUndoStack(useFfmpegBpmnStore.getState().bpmnXml)
        setBpmnXmlFromModeler(xml)
      }
    } catch (error) {
      console.error('保存XML失败:', error)
    }
  }, [pushToUndoStack, setBpmnXmlFromModeler])

  const scheduleExportXmlFromModeler = useCallback(() => {
    if (exportTimerRef.current) clearTimeout(exportTimerRef.current)
    exportTimerRef.current = setTimeout(() => {
      void exportXmlFromModeler()
    }, XML_EXPORT_DEBOUNCE_MS)
  }, [exportXmlFromModeler])

  const scheduleExportRef = useRef(scheduleExportXmlFromModeler)
  scheduleExportRef.current = scheduleExportXmlFromModeler

  useEffect(() => {
    if (!containerRef.current || modelerRef.current) return

    const modeler = new BpmnModeler({
      container: containerRef.current,
      additionalModules: [
        customPalette,
        customContextPad,
        customRules,
        customReplaceMenu
      ],
      moddleExtensions: {
        ffmpeg: ffmpegModdle
      },
      keyboard: {
        bindTo: document
      }
    })

    modelerRef.current = modeler
    setModelerRef(modeler)

    modeler.on('selection.changed', (event: any) => {
      const { newSelection } = event

      if (newSelection.length === 1) {
        const element = newSelection[0]
        const bpmnElement: BpmnElement = {
          id: element.id,
          type: element.type as BpmnElement['type'],
          name: element.businessObject?.name,
          businessObject: element.businessObject
        }
        setSelectedElement(bpmnElement)
      } else {
        setSelectedElement(null)
      }
    })

    modeler.on('commandStack.shape.create.postExecute', (event: any) => {
      const shape = event.context?.shape
      if (!shape || shape.type !== 'bpmn:ServiceTask') return

      persistFfmpegConfigToModel(modeler, shape.id, {
        ...DEFAULT_FFMPEG_CONFIG,
        output: { ...DEFAULT_FFMPEG_CONFIG.output, var: `${shape.id}.output` }
      })
    })

    modeler.on('commandStack.changed', () => {
      scheduleExportRef.current()
    })

    importXml(bpmnXml)
    setIsModelerReady(true)

    return () => {
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current)
      if (modelerRef.current) {
        modelerRef.current.destroy()
        modelerRef.current = null
      }
    }
  }, [])

  const importXml = useCallback(async (xml: string) => {
    if (!modelerRef.current) return

    try {
      await modelerRef.current.importXML(xml)
      const canvas = modelerRef.current.get('canvas') as any
      canvas.zoom('fit-viewport')
    } catch (error) {
      console.error('BPMN XML导入失败:', error)
    }
  }, [])

  const saveCurrentXml = useCallback(async () => {
    await exportXmlFromModeler()
  }, [exportXmlFromModeler])

  const syncXml = useCallback(async (
    newXml: string,
    options: { preserveViewState?: boolean; useSmartSync?: boolean } = {}
  ) => {
    if (!modelerRef.current || !xmlSyncManager) return

    const { preserveViewState = true, useSmartSync = true } = options

    try {
      const { xml: currentXml } = await modelerRef.current.saveXML({ format: true })

      if (currentXml && !XmlDiffAnalyzer.hasSignificantChanges(currentXml, newXml)) {
        return
      }

      if (useSmartSync && currentXml) {
        await xmlSyncManager.smartSync(newXml, currentXml)
      } else {
        await xmlSyncManager.syncWithFullReload(newXml, { preserveViewState })
      }
    } catch {
      await importXml(newXml)
    }
  }, [xmlSyncManager, importXml])

  useEffect(() => {
    if (!isModelerReady || !modelerRef.current || !xmlSyncManager) return

    if (modelerXmlSyncToken !== lastModelerSyncTokenRef.current) {
      lastModelerSyncTokenRef.current = modelerXmlSyncToken
      return
    }

    modelerRef.current.saveXML({ format: true })
      .then(({ xml: currentXml }) => {
        if (currentXml && XmlDiffAnalyzer.hasSignificantChanges(currentXml, bpmnXml)) {
          syncXml(bpmnXml, { preserveViewState: true, useSmartSync: true })
        }
      })
      .catch(() => importXml(bpmnXml))
  }, [bpmnXml, modelerXmlSyncToken, isModelerReady, xmlSyncManager, syncXml, importXml])

  useEffect(() => {
    if (modelerRef.current && isModelerReady) {
      const canvas = modelerRef.current.get('canvas') as any
      canvas.zoom(zoomLevel)
    }
  }, [zoomLevel, isModelerReady])

  const getCanvas = useCallback(() => {
    if (!modelerRef.current) return null
    return modelerRef.current.get('canvas') as any
  }, [])

  const getSvg = useCallback(async (): Promise<string | null> => {
    if (!modelerRef.current) return null

    try {
      const { svg } = await modelerRef.current.saveSVG()
      return svg
    } catch {
      return null
    }
  }, [])

  const getPerformanceMetrics = useCallback(() => {
    return xmlSyncManager?.getPerformanceMetrics() || null
  }, [xmlSyncManager])

  React.useImperativeHandle(
    ref,
    () => ({
      getCanvas,
      getSvg,
      importXml,
      saveCurrentXml,
      syncXml,
      getPerformanceMetrics
    }),
    [getCanvas, getSvg, importXml, saveCurrentXml, syncXml, getPerformanceMetrics]
  )

  return (
    <div className={`bpmn-designer ${className || ''}`}>
      <div ref={containerRef} className="bpmn-designer__canvas" />
      {!isModelerReady && (
        <div className="bpmn-designer__loading">
          <div className="bpmn-designer__loading-spinner" />
          <span>正在加载 FFmpeg 工作流设计器...</span>
        </div>
      )}
      {minimapOpen && isModelerReady && (
        <div className="bpmn-designer__minimap" id="ffmpeg-bpmn-minimap" />
      )}
    </div>
  )
})

FfmpegDesigner.displayName = 'FfmpegDesigner'

export default FfmpegDesigner
