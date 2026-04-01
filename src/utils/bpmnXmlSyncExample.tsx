/**
 * BPMN XML 同步使用示例
 * 展示如何在 React 组件中使用 XML 同步管理器
 */

import React, { useRef, useState, useCallback } from 'react'
import BpmnDesigner from '../pages/bpmn/components/BpmnDesigner'
import { useBpmnStore } from '../stores/bpmnStore'
import { XmlDiffAnalyzer } from './bpmnXmlSync'

// 示例：如何使用 XML 同步功能
export const BpmnXmlSyncExample: React.FC = () => {
  const designerRef = useRef<any>(null)
  const { bpmnXml, setBpmnXml } = useBpmnStore()
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null)

  // 示例1: 全量重载 XML（保留视图状态）
  const handleFullReload = useCallback(async () => {
    if (!designerRef.current) return

    const newXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" 
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" 
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" 
  id="Definitions_1" 
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="开始" />
    <bpmn:task id="Task_1" name="新任务" />
    <bpmn:endEvent id="EndEvent_1" name="结束" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="158" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="392" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="398" y="145" width="24" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="120" />
        <di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="120" />
        <di:waypoint x="392" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

    try {
      // 使用全量重载，保留视图状态
      await designerRef.current.syncXml(newXml, {
        preserveViewState: true,
        useSmartSync: false
      })
      
      console.log('全量重载完成')
    } catch (error) {
      console.error('全量重载失败:', error)
    }
  }, [])

  // 示例2: 智能同步（自动选择最优方案）
  const handleSmartSync = useCallback(async () => {
    if (!designerRef.current) return

    // 修改当前XML（例如只改变一个节点的名称）
    const modifiedXml = bpmnXml.replace(
      /name="开始"/g,
      'name="流程开始"'
    )

    try {
      // 使用智能同步，会自动判断使用局部更新还是全量重载
      await designerRef.current.syncXml(modifiedXml, {
        preserveViewState: true,
        useSmartSync: true
      })
      
      console.log('智能同步完成')
      
      // 获取性能指标
      const metrics = designerRef.current.getPerformanceMetrics()
      setPerformanceMetrics(metrics)
    } catch (error) {
      console.error('智能同步失败:', error)
    }
  }, [bpmnXml])

  // 示例3: 防抖同步（适合实时编辑场景）
  const handleDebouncedSync = useCallback(async (newXml: string) => {
    if (!designerRef.current) return

    try {
      // 使用防抖同步，避免频繁更新
      await designerRef.current.syncXml(newXml, {
        preserveViewState: true,
        useSmartSync: true
      })
    } catch (error) {
      console.error('防抖同步失败:', error)
    }
  }, [])

  // 示例4: 使用 XML 工具函数
  const handleAnalyzeXml = useCallback(() => {
    const currentXml = bpmnXml
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="测试开始" />
  </bpmn:process>
</bpmn:definitions>`

    // 检查是否有显著变化
    const hasChanges = XmlDiffAnalyzer.hasSignificantChanges(currentXml, testXml)
    console.log('XML是否有显著变化:', hasChanges)

    // 比较元素差异
    const comparison = XmlDiffAnalyzer.compareElements(currentXml, testXml)
    console.log('元素差异:', comparison)

    // 计算相似度
    const similarity = XmlDiffAnalyzer.calculateSimilarity(currentXml, testXml)
    console.log('XML相似度:', similarity)
  }, [bpmnXml])

  // 示例5: 批量更新多个元素
  const handleBatchUpdate = useCallback(async () => {
    if (!designerRef.current) return

    // 这里演示如何通过 modeling API 批量更新
    // 注意：这需要在 BpmnDesigner 中暴露更多方法
    // 或者直接使用 store 中的 modelerRef
    
    const { modelerRef: modeler } = useBpmnStore.getState()
    if (!modeler) {
      console.warn('Modeler not initialized')
      return
    }

    try {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      
      // 批量更新多个任务的名称
      const tasks = elementRegistry.filter((el: any) => 
        el.type === 'bpmn:Task' || el.type === 'bpmn:UserTask'
      )
      
      tasks.forEach((task: any, index: number) => {
        modeling.updateProperties(task, {
          name: `批量更新的任务 ${index + 1}`
        })
      })
      
      console.log(`批量更新了 ${tasks.length} 个任务`)
    } catch (error) {
      console.error('批量更新失败:', error)
    }
  }, [])

  return (
    <div className="bpmn-xml-sync-example">
      <h2>BPMN XML 同步示例</h2>
      
      <div className="example-controls">
        <button onClick={handleFullReload}>
          全量重载 XML
        </button>
        
        <button onClick={handleSmartSync}>
          智能同步
        </button>
        
        <button onClick={handleAnalyzeXml}>
          分析 XML 差异
        </button>
        
        <button onClick={handleBatchUpdate}>
          批量更新元素
        </button>
      </div>

      {/* 性能指标显示 */}
      {performanceMetrics && (
        <div className="performance-metrics">
          <h3>性能指标</h3>
          <p>导入时间: {performanceMetrics.importTime.toFixed(2)}ms</p>
          <p>状态恢复时间: {performanceMetrics.stateRestoreTime.toFixed(2)}ms</p>
          <p>同步次数: {performanceMetrics.syncCount}</p>
          <p>最后同步: {new Date(performanceMetrics.lastSyncTimestamp).toLocaleString()}</p>
        </div>
      )}

      {/* BPMN 设计器 */}
      <div className="designer-container">
        <BpmnDesigner ref={designerRef} />
      </div>

      {/* 使用说明 */}
      <div className="usage-notes">
        <h3>使用说明</h3>
        <ul>
          <li><strong>全量重载:</strong> 适用于 XML 结构大幅变化，会重新加载整个流程图</li>
          <li><strong>智能同步:</strong> 自动分析差异，选择最优同步策略（局部更新或全量重载）</li>
          <li><strong>防抖同步:</strong> 适合实时编辑场景，避免频繁更新导致的性能问题</li>
          <li><strong>批量更新:</strong> 通过 Modeling API 直接更新元素，性能最佳</li>
        </ul>
        
        <h3>最佳实践</h3>
        <ul>
          <li>优先使用 <code>syncXml</code> 方法，它会自动选择最优方案</li>
          <li>对于属性修改，使用 <code>syncWithPartialUpdate</code> 性能更好</li>
          <li>大型流程图建议开启防抖功能</li>
          <li>使用性能监控功能优化同步策略</li>
        </ul>
      </div>
    </div>
  )
}

// 高级用法：自定义 XML 同步 Hook
export const useCustomXmlSync = () => {
  const { modelerRef } = useBpmnStore()
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle')

  const syncWithCallback = useCallback(async (
    newXml: string,
    onSuccess?: () => void,
    onError?: (error: Error) => void
  ) => {
    if (!modelerRef) {
      onError?.(new Error('Modeler not initialized'))
      return
    }

    setSyncStatus('syncing')

    try {
      const { xml: currentXml } = await modelerRef.saveXML({ format: true })
      
      // 使用智能同步逻辑
      if (currentXml && XmlDiffAnalyzer.hasSignificantChanges(currentXml, newXml)) {
        // 这里可以集成到 BpmnDesigner 的 syncXml 方法
        // 或者直接使用 importXML
        await modelerRef.importXML(newXml)
      }
      
      setSyncStatus('idle')
      onSuccess?.()
    } catch (error) {
      setSyncStatus('error')
      onError?.(error as Error)
    }
  }, [modelerRef])

  return {
    syncStatus,
    syncWithCallback
  }
}

export default BpmnXmlSyncExample