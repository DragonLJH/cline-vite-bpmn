/**
 * BPMN XML 同步工具
 * 提供高效的 XML 同步方案，支持状态恢复和性能优化
 */

import type BpmnModeler from 'bpmn-js/lib/Modeler'

// 视图状态接口
export interface ViewState {
  zoom: number
  scroll: { x: number; y: number }
  selectedElementIds: string[]
  visibleElements?: string[] // 可见元素（用于虚拟滚动优化）
}

// XML 同步选项
export interface SyncOptions {
  preserveViewState?: boolean  // 是否保留视图状态
  skipUndoStack?: boolean      // 是否跳过撤销栈
  forceFullReload?: boolean    // 是否强制全量重载
  debounceDelay?: number       // 防抖延迟（毫秒）
}

// 变更类型枚举
export enum ChangeType {
  ELEMENT_ADDED = 'element.added',
  ELEMENT_REMOVED = 'element.removed',
  ELEMENT_CHANGED = 'element.changed',
  PROPERTY_CHANGED = 'property.changed'
}

// 变更描述接口
export interface ChangeDescriptor {
  type: ChangeType
  elementId: string
  oldXml?: string
  newXml?: string
  property?: string
  oldValue?: any
  newValue?: any
}

// 性能监控接口
export interface PerformanceMetrics {
  importTime: number
  stateRestoreTime: number
  lastSyncTimestamp: number
  syncCount: number
}

/**
 * BPMN XML 同步管理器
 */
export class BpmnXmlSyncManager {
  private modeler: BpmnModeler
  private lastSyncedXml: string = ''
  private pendingChanges: ChangeDescriptor[] = []
  private debounceTimer: NodeJS.Timeout | null = null
  private performanceMetrics: PerformanceMetrics = {
    importTime: 0,
    stateRestoreTime: 0,
    lastSyncTimestamp: 0,
    syncCount: 0
  }
  private isImporting: boolean = false // 防止并发导入

  constructor(modeler: BpmnModeler) {
    this.modeler = modeler
  }

  /**
   * 获取当前视图状态
   */
  getViewState(): ViewState {
    const canvas = this.modeler.get('canvas') as any
    const selection = this.modeler.get('selection') as any
    const elementRegistry = this.modeler.get('elementRegistry') as any
    
    const selectedElements = selection.get() || []
    const selectedElementIds = selectedElements.map((el: any) => el.id)
    
    // 获取当前可见的元素（可选，用于大型流程图优化）
    const allElements = elementRegistry.getAll()
    const visibleElements = allElements
      .filter((el: any) => el.type !== 'label')
      .map((el: any) => el.id)

    return {
      zoom: canvas.zoom(),
      scroll: {
        x: canvas.scroll().x,
        y: canvas.scroll().y
      },
      selectedElementIds,
      visibleElements
    }
  }

  /**
   * 恢复视图状态
   */
  restoreViewState(state: ViewState): Promise<void> {
    return new Promise((resolve) => {
      const canvas = this.modeler.get('canvas') as any
      const selection = this.modeler.get('selection') as any
      const elementRegistry = this.modeler.get('elementRegistry') as any

      // 使用 requestAnimationFrame 确保渲染完成
      requestAnimationFrame(() => {
        try {
          // 恢复缩放
          canvas.zoom(state.zoom)
          
          // 恢复滚动位置
          canvas.scroll(state.scroll)
          
          // 恢复选中状态
          if (state.selectedElementIds.length > 0) {
            const elementsToSelect = state.selectedElementIds
              .map((id: string) => elementRegistry.get(id))
              .filter(Boolean)
            
            if (elementsToSelect.length > 0) {
              selection.select(elementsToSelect)
            }
          }

          console.log('视图状态恢复完成', state)
          resolve()
        } catch (error) {
          console.warn('恢复视图状态失败:', error)
          resolve() // 不抛出错误，避免阻塞主流程
        }
      })
    })
  }

  /**
   * 方案1: 标准 importXML 方法（全量重载）
   * 适用于：XML 结构大幅变化、新增/删除多个元素
   */
  async syncWithFullReload(newXml: string, options: SyncOptions = {}): Promise<void> {
    if (this.isImporting) {
      console.warn('XML导入正在进行中，跳过本次同步')
      return
    }

    const { preserveViewState = true, skipUndoStack = false } = options
    const startTime = performance.now()
    
    this.isImporting = true

    try {
      // 保存当前状态
      const viewState = preserveViewState ? this.getViewState() : null
      
      // 保存当前XML用于撤销（如果不跳过）
      if (!skipUndoStack) {
        try {
          const { xml: currentXml } = await this.modeler.saveXML({ format: true })
          if (currentXml) {
            // 这里可以集成到 store 的撤销栈
            console.log('已保存当前XML用于撤销')
          }
        } catch (error) {
          console.warn('保存当前XML失败:', error)
        }
      }

      // 执行 XML 导入
      const importStartTime = performance.now()
      await this.modeler.importXML(newXml)
      this.performanceMetrics.importTime = performance.now() - importStartTime
      
      // 恢复视图状态
      if (viewState && preserveViewState) {
        const restoreStartTime = performance.now()
        await this.restoreViewState(viewState)
        this.performanceMetrics.stateRestoreTime = performance.now() - restoreStartTime
      }
      
      this.lastSyncedXml = newXml
      this.performanceMetrics.lastSyncTimestamp = Date.now()
      this.performanceMetrics.syncCount++
      
      console.log(`XML 全量重载完成，耗时: ${performance.now() - startTime}ms`)
    } catch (error) {
      console.error('XML 导入失败:', error)
      throw error
    } finally {
      this.isImporting = false
    }
  }

  /**
   * 方案2: 局部更新（使用 Modeling API）
   * 适用于：只修改单个元素的属性、位置等
   */
  syncWithPartialUpdate(elementId: string, updates: Record<string, any>): boolean {
    try {
      const elementRegistry = this.modeler.get('elementRegistry') as any
      const modeling = this.modeler.get('modeling') as any
      
      const element = elementRegistry.get(elementId)
      if (!element) {
        console.warn('元素不存在:', elementId)
        return false
      }

      // 使用 modeling API 更新元素
      modeling.updateProperties(element, updates)
      
      // 更新最后同步的XML
      this.updateLastSyncedXml()
      
      console.log('局部更新完成:', elementId, updates)
      return true
    } catch (error) {
      console.error('局部更新失败:', error)
      return false
    }
  }

  /**
   * 方案3: 批量局部更新
   * 适用于：同时更新多个元素的属性
   */
  batchPartialUpdate(updates: Array<{ elementId: string; updates: Record<string, any> }>): boolean[] {
    return updates.map(({ elementId, updates }) => 
      this.syncWithPartialUpdate(elementId, updates)
    )
  }

  /**
   * 方案4: 智能同步（自动判断使用哪种方案）
   * 分析 XML 差异，选择最优同步策略
   */
  async smartSync(newXml: string, currentXml?: string): Promise<void> {
    const xmlToCompare = currentXml || this.lastSyncedXml
    
    if (!xmlToCompare) {
      // 没有历史XML，使用全量重载
      await this.syncWithFullReload(newXml)
      return
    }

    const changes = this.analyzeXmlChanges(newXml, xmlToCompare)
    
    if (changes.length === 0) {
      console.log('XML 无变化，跳过同步')
      return
    }

    // 判断是否可以使用局部更新
    const canUsePartialUpdate = this.canUsePartialUpdate(changes)
    
    if (canUsePartialUpdate && changes.length <= 10) {
      // 使用批量局部更新
      console.log('使用批量局部更新方案')
      const updates = changes
        .filter(c => c.type === ChangeType.PROPERTY_CHANGED)
        .map(c => ({
          elementId: c.elementId,
          updates: { [c.property!]: c.newValue }
        }))
      
      this.batchPartialUpdate(updates)
    } else {
      // 使用全量重载
      console.log('使用全量重载方案')
      await this.syncWithFullReload(newXml, { preserveViewState: true })
    }
  }

  /**
   * 分析 XML 变化
   */
  private analyzeXmlChanges(newXml: string, currentXml: string): ChangeDescriptor[] {
    // 使用简单的XML对比
    const changes: ChangeDescriptor[] = []
    
    // 提取元素ID
    const currentIds = this.extractElementIds(currentXml)
    const newIds = this.extractElementIds(newXml)
    
    // 检查新增的元素
    for (const id of newIds) {
      if (!currentIds.has(id)) {
        changes.push({
          type: ChangeType.ELEMENT_ADDED,
          elementId: id,
          newXml: this.extractElementXml(newXml, id)
        })
      }
    }
    
    // 检查删除的元素
    for (const id of currentIds) {
      if (!newIds.has(id)) {
        changes.push({
          type: ChangeType.ELEMENT_REMOVED,
          elementId: id,
          oldXml: this.extractElementXml(currentXml, id)
        })
      }
    }
    
    // 检查修改的元素（简化实现）
    for (const id of currentIds) {
      if (newIds.has(id)) {
        const oldElementXml = this.extractElementXml(currentXml, id)
        const newElementXml = this.extractElementXml(newXml, id)
        
        if (oldElementXml !== newElementXml) {
          // 进一步分析是属性变化还是结构变化
          const propertyChanges = this.analyzePropertyChanges(oldElementXml, newElementXml)
          if (propertyChanges.length > 0) {
            changes.push(...propertyChanges.map(prop => ({
              type: ChangeType.PROPERTY_CHANGED,
              elementId: id,
              property: prop.property,
              oldValue: prop.oldValue,
              newValue: prop.newValue
            })))
          } else {
            changes.push({
              type: ChangeType.ELEMENT_CHANGED,
              elementId: id,
              oldXml: oldElementXml,
              newXml: newElementXml
            })
          }
        }
      }
    }
    
    return changes
  }

  /**
   * 提取元素ID集合
   */
  private extractElementIds(xml: string): Set<string> {
    const ids = new Set<string>()
    const regex = /id="([^"]+)"/g
    let match
    
    while ((match = regex.exec(xml)) !== null) {
      ids.add(match[1])
    }
    
    return ids
  }

  /**
   * 提取单个元素的XML
   */
  private extractElementXml(xml: string, elementId: string): string {
    const regex = new RegExp(`<[^>]*id="${elementId}"[^>]*>.*?</[^>]*>|<[^>]*id="${elementId}"[^>]*/>`, 's')
    const match = xml.match(regex)
    return match ? match[0] : ''
  }

  /**
   * 分析属性变化
   */
  private analyzePropertyChanges(oldXml: string, newXml: string): Array<{ property: string; oldValue: string; newValue: string }> {
    const changes: Array<{ property: string; oldValue: string; newValue: string }> = []
    
    // 提取属性并比较
    const attrRegex = /(\w+)="([^"]*)"/g
    const oldAttrs = new Map<string, string>()
    const newAttrs = new Map<string, string>()
    
    let match
    while ((match = attrRegex.exec(oldXml)) !== null) {
      oldAttrs.set(match[1], match[2])
    }
    
    while ((match = attrRegex.exec(newXml)) !== null) {
      newAttrs.set(match[1], match[2])
    }
    
    // 比较属性差异
    for (const [key, oldValue] of oldAttrs) {
      const newValue = newAttrs.get(key)
      if (newValue !== undefined && newValue !== oldValue) {
        changes.push({
          property: key,
          oldValue,
          newValue
        })
      }
    }
    
    return changes
  }

  /**
   * 判断是否可以使用局部更新
   */
  private canUsePartialUpdate(changes: ChangeDescriptor[]): boolean {
    // 如果有元素添加或删除，必须使用全量重载
    const hasStructuralChanges = changes.some(c => 
      c.type === ChangeType.ELEMENT_ADDED || 
      c.type === ChangeType.ELEMENT_REMOVED ||
      c.type === ChangeType.ELEMENT_CHANGED
    )
    
    return !hasStructuralChanges
  }

  /**
   * 更新最后同步的XML
   */
  private async updateLastSyncedXml(): Promise<void> {
    try {
      const { xml } = await this.modeler.saveXML({ format: true })
      if (xml) {
        this.lastSyncedXml = xml
      }
    } catch (error) {
      console.warn('更新最后同步XML失败:', error)
    }
  }

  /**
   * 防抖同步（避免频繁同步）
   */
  debouncedSync(newXml: string, delay: number = 300): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }
      
      this.debounceTimer = setTimeout(async () => {
        try {
          await this.smartSync(newXml)
          resolve()
        } catch (error) {
          reject(error)
        }
      }, delay)
    })
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics }
  }

  /**
   * 重置性能指标
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      importTime: 0,
      stateRestoreTime: 0,
      lastSyncTimestamp: 0,
      syncCount: 0
    }
  }

  /**
   * 检查是否正在导入
   */
  isCurrentlyImporting(): boolean {
    return this.isImporting
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
  }
}

/**
 * XML 同步 Hook 辅助函数
 */
export function createXmlSyncManager(modeler: BpmnModeler): BpmnXmlSyncManager {
  return new BpmnXmlSyncManager(modeler)
}

/**
 * 高性能 XML 对比工具
 */
export class XmlDiffAnalyzer {
  /**
   * 快速检测 XML 是否有实质变化
   */
  static hasSignificantChanges(xml1: string, xml2: string): boolean {
    // 移除空白和格式化差异
    const normalize = (xml: string) => 
      xml.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
    
    return normalize(xml1) !== normalize(xml2)
  }

  /**
   * 提取所有元素 ID
   */
  static extractElementIds(xml: string): Set<string> {
    const ids = new Set<string>()
    const regex = /id="([^"]+)"/g
    let match
    
    while ((match = regex.exec(xml)) !== null) {
      ids.add(match[1])
    }
    
    return ids
  }

  /**
   * 比较两个 XML 的元素差异
   */
  static compareElements(xml1: string, xml2: string): {
    added: string[]
    removed: string[]
    common: string[]
  } {
    const ids1 = this.extractElementIds(xml1)
    const ids2 = this.extractElementIds(xml2)
    
    const added = Array.from(ids2).filter(id => !ids1.has(id))
    const removed = Array.from(ids1).filter(id => !ids2.has(id))
    const common = Array.from(ids1).filter(id => ids2.has(id))
    
    return { added, removed, common }
  }

  /**
   * 计算 XML 相似度（0-1）
   */
  static calculateSimilarity(xml1: string, xml2: string): number {
    const ids1 = this.extractElementIds(xml1)
    const ids2 = this.extractElementIds(xml2)
    
    const intersection = new Set([...ids1].filter(id => ids2.has(id)))
    const union = new Set([...ids1, ...ids2])
    
    if (union.size === 0) return 1
    
    return intersection.size / union.size
  }
}

/**
 * React Hook: 使用 XML 同步管理器
 */
export function useXmlSync(modeler: BpmnModeler | null) {
  const managerRef = React.useRef<BpmnXmlSyncManager | null>(null)
  
  React.useEffect(() => {
    if (modeler && !managerRef.current) {
      managerRef.current = createXmlSyncManager(modeler)
    }
    
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy()
        managerRef.current = null
      }
    }
  }, [modeler])
  
  return managerRef.current
}

// 需要导入 React
import React from 'react'