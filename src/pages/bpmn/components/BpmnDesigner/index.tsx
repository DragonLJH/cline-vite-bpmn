import React, { useEffect, useRef, useState, useCallback } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import type { BpmnElement } from '../../../../types/bpmn'
import { useBpmnStore } from '../../../../stores/bpmnStore'
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
    modeler.on('element.changed', () => {
      // 保存当前XML到撤销栈
      saveCurrentXml()
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

  // 监听外部XML变化
  useEffect(() => {
    if (isModelerReady && modelerRef.current) {
      importXml(bpmnXml)
    }
  }, [bpmnXml, isModelerReady, importXml])

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

  // 暴露方法给父组件
  React.useImperativeHandle(
    ref,
    () => ({
      getCanvas,
      getSvg,
      importXml,
      saveCurrentXml
    }),
    [getCanvas, getSvg, importXml, saveCurrentXml]
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
