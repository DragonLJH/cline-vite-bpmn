import React, { useEffect, useRef, useState, useCallback } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import type { BpmnElement } from '../../../../types/bpmn'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { useXmlSync, XmlDiffAnalyzer } from '../../../../utils/bpmnXmlSync'
import './index.scss'

// 导入bpmn-js样式
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

interface BpmnDesignerRef {
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

interface BpmnDesignerProps {
  className?: string
}

const BpmnDesigner = React.forwardRef<BpmnDesignerRef, BpmnDesignerProps>(({ className }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const modelerRef = useRef<BpmnModeler | null>(null)
  const [isModelerReady, setIsModelerReady] = useState(false)

  const {
    bpmnXml,
    setBpmnXml,
    setSelectedElement,
    pushToUndoStack,
    zoomLevel,
    minimapOpen,
    setModelerRef
  } = useBpmnStore()

  // XML 同步管理器
  const xmlSyncManager = useXmlSync(modelerRef.current)

  // 初始化BPMN Modeler
  useEffect(() => {
    if (!containerRef.current || modelerRef.current) return

    const modeler = new BpmnModeler({
      container: containerRef.current,
      additionalModules: [],
      moddleExtensions: {},
      keyboard: {
        bindTo: document
      }
    })

    modelerRef.current = modeler
    
    // 将modeler实例保存到store
    setModelerRef(modeler)

    // 监听元素选择事件
    modeler.on('selection.changed', (event: any) => {
      const { newSelection } = event
      if (newSelection.length === 1) {
        const element = newSelection[0]
        const bpmnElement: BpmnElement = {
          id: element.id,
          type: element.type as any,
          name: element.businessObject?.name,
          businessObject: element.businessObject
        }
        setSelectedElement(bpmnElement)
      } else {
        setSelectedElement(null)
      }
    })

    // 监听元素变化事件
    modeler.on('element.changed', (event: any) => {
      const { element } = event
      
      // 保存当前XML到撤销栈
      saveCurrentXml()
      
      // 如果当前选中的元素被修改了，刷新 selectedElement
      const { selectedElement } = useBpmnStore.getState()
      if (selectedElement && selectedElement.id === element.id) {
        const updatedElement: BpmnElement = {
          id: element.id,
          type: element.type as any,
          name: element.businessObject?.name,
          businessObject: element.businessObject
        }
        setSelectedElement(updatedElement)
      }
    })

    // 监听命令栈变化（用于撤销/重做）
    modeler.on('commandStack.changed', () => {
      saveCurrentXml()
    })

    // 导入初始XML
    importXml(bpmnXml)
    setIsModelerReady(true)

    return () => {
      if (modelerRef.current) {
        modelerRef.current.destroy()
        modelerRef.current = null
      }
    }
  }, [])

  // 导入XML
  const importXml = useCallback(async (xml: string) => {
    if (!modelerRef.current) return

    try {
      await modelerRef.current.importXML(xml)
      
      // 调整画布以适应视图
      const canvas = modelerRef.current.get('canvas') as any
      canvas.zoom('fit-viewport')
    } catch (error) {
      console.error('BPMN XML导入失败:', error)
    }
  }, [])

  // 保存当前XML
  const saveCurrentXml = useCallback(async () => {
    if (!modelerRef.current) return

    try {
      const { xml } = await modelerRef.current.saveXML({ format: true })
      if (xml) {
        pushToUndoStack(bpmnXml)
        setBpmnXml(xml)
      }
    } catch (error) {
      console.error('保存XML失败:', error)
    }
  }, [bpmnXml, setBpmnXml, pushToUndoStack])

  // 智能 XML 同步（避免不必要的重载）
  const syncXml = useCallback(async (
    newXml: string, 
    options: { 
      preserveViewState?: boolean
      useSmartSync?: boolean 
    } = {}
  ) => {
    if (!modelerRef.current || !xmlSyncManager) return

    const { preserveViewState = true, useSmartSync = true } = options

    try {
      // 获取当前XML用于比较
      const { xml: currentXml } = await modelerRef.current.saveXML({ format: true })
      
      // 检查是否有实质变化
      if (currentXml && !XmlDiffAnalyzer.hasSignificantChanges(currentXml, newXml)) {
        console.log('XML无实质变化，跳过同步')
        return
      }

      if (useSmartSync && currentXml) {
        // 使用智能同步
        await xmlSyncManager.smartSync(newXml, currentXml)
      } else {
        // 使用全量重载
        await xmlSyncManager.syncWithFullReload(newXml, { preserveViewState })
      }
    } catch (error) {
      console.error('XML同步失败:', error)
      // 回退到标准导入
      await importXml(newXml)
    }
  }, [xmlSyncManager, importXml])

  // 监听外部XML变化（使用智能同步）
  useEffect(() => {
    if (isModelerReady && modelerRef.current && xmlSyncManager) {
      // 避免初始加载时的重复导入
      modelerRef.current.saveXML({ format: true })
        .then(({ xml: currentXml }) => {
          if (currentXml && XmlDiffAnalyzer.hasSignificantChanges(currentXml, bpmnXml)) {
            syncXml(bpmnXml, { preserveViewState: true, useSmartSync: true })
          }
        })
        .catch(() => {
          // 如果获取当前XML失败，直接导入
          importXml(bpmnXml)
        })
    }
  }, [bpmnXml, isModelerReady, xmlSyncManager, syncXml, importXml])

  // 监听缩放变化
  useEffect(() => {
    if (modelerRef.current && isModelerReady) {
      const canvas = modelerRef.current.get('canvas') as any
      canvas.zoom(zoomLevel)
    }
  }, [zoomLevel, isModelerReady])

  // 获取画布引用（用于导出功能）
  const getCanvas = useCallback(() => {
    if (!modelerRef.current) return null
    return modelerRef.current.get('canvas') as any
  }, [])

  // 获取SVG（用于导出）
  const getSvg = useCallback(async (): Promise<string | null> => {
    if (!modelerRef.current) return null

    try {
      const { svg } = await modelerRef.current.saveSVG()
      return svg
    } catch (error) {
      console.error('获取SVG失败:', error)
      return null
    }
  }, [])

  // 获取性能指标
  const getPerformanceMetrics = useCallback(() => {
    return xmlSyncManager?.getPerformanceMetrics() || null
  }, [xmlSyncManager])

  // 暴露方法给父组件
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
      <div 
        ref={containerRef} 
        className="bpmn-designer__canvas"
      />
      
      {/* 加载状态 */}
      {!isModelerReady && (
        <div className="bpmn-designer__loading">
          <div className="bpmn-designer__loading-spinner" />
          <span>正在加载BPMN设计器...</span>
        </div>
      )}

      {/* 迷你地图 */}
      {minimapOpen && isModelerReady && (
        <div className="bpmn-designer__minimap" id="bpmn-minimap" />
      )}
    </div>
  )
})

export default BpmnDesigner
