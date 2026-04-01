import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useBpmnStore } from '../../../../stores/bpmnStore'
import { 
  parseAllNodes, 
  parseNodesByType, 
  getNodeTypeName,
  updateNodeNameInXml,
  updateNodeIdInXml,
  type ParsedNode 
} from '../../../../utils/bpmnParser'
import Icon, { type IconName } from '../../../../components/Icon'
import './index.scss'

interface NodeListEditorProps {
  className?: string
}

type ViewMode = 'list' | 'group'

const NodeListEditor: React.FC<NodeListEditorProps> = ({ className }) => {
  const { bpmnXml, setBpmnXml, modelerRef, pushToUndoStack, setHasUnsavedChanges, setSelectedElement } = useBpmnStore()
  
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [searchText, setSearchText] = useState('')
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingIdValue, setEditingIdValue] = useState('')

  // 解析节点
  const allNodes = useMemo(() => parseAllNodes(bpmnXml), [bpmnXml])
  const nodesByType = useMemo(() => parseNodesByType(bpmnXml), [bpmnXml])

  // 过滤节点
  const filteredNodes = useMemo(() => {
    if (!searchText) return allNodes
    const lowerSearch = searchText.toLowerCase()
    return allNodes.filter(node => 
      node.id.toLowerCase().includes(lowerSearch) ||
      (node.name && node.name.toLowerCase().includes(lowerSearch)) ||
      node.type.toLowerCase().includes(lowerSearch)
    )
  }, [allNodes, searchText])

  // 过滤分组节点
  const filteredNodesByType = useMemo(() => {
    if (!searchText) return nodesByType
    const lowerSearch = searchText.toLowerCase()
    const result: Record<string, ParsedNode[]> = {}
    
    Object.entries(nodesByType).forEach(([type, nodes]) => {
      const filtered = nodes.filter(node => 
        node.id.toLowerCase().includes(lowerSearch) ||
        (node.name && node.name.toLowerCase().includes(lowerSearch))
      )
      if (filtered.length > 0) {
        result[type] = filtered
      }
    })
    
    return result
  }, [nodesByType, searchText])

  // 切换展开/折叠
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodeId(prev => prev === nodeId ? null : nodeId)
  }, [])

  // 开始编辑名称
  const handleStartEditName = useCallback((node: ParsedNode) => {
    setEditingNodeId(node.id)
    setEditingName(node.name || '')
    setEditingIdValue(node.id)
  }, [])

  // 保存名称编辑
  const handleSaveName = useCallback(() => {
    if (!editingNodeId) return

    let newXml = bpmnXml
    
    // 更新名称
    if (editingName !== allNodes.find(n => n.id === editingNodeId)?.name) {
      newXml = updateNodeNameInXml(newXml, editingNodeId, editingName)
    }
    
    // 更新ID
    if (editingIdValue !== editingNodeId) {
      newXml = updateNodeIdInXml(newXml, editingNodeId, editingIdValue)
    }

    if (newXml !== bpmnXml) {
      pushToUndoStack(bpmnXml)
      setBpmnXml(newXml)
      setHasUnsavedChanges(true)

      // 同步到画布
      if (modelerRef) {
        modelerRef.importXML(newXml).then(() => {
          const canvas = modelerRef.get('canvas') as any
          if (canvas) {
            canvas.zoom('fit-viewport')
          }
        })
      }
    }

    setEditingNodeId(null)
    setEditingName('')
    setEditingIdValue('')
  }, [editingNodeId, editingName, editingIdValue, bpmnXml, allNodes, pushToUndoStack, setBpmnXml, setHasUnsavedChanges, modelerRef])

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    setEditingNodeId(null)
    setEditingName('')
    setEditingIdValue('')
  }, [])

  // 在画布中选中节点
  const handleSelectInCanvas = useCallback((nodeId: string) => {
    if (modelerRef) {
      const elementRegistry = modelerRef.get('elementRegistry')
      const element = elementRegistry.get(nodeId)
      if (element) {
        const selection = modelerRef.get('selection')
        selection.select(element)
        
        const bpmnElement = {
          id: element.id,
          type: element.type as any,
          name: element.businessObject?.name,
          businessObject: element.businessObject
        }
        setSelectedElement(bpmnElement)
      }
    }
  }, [modelerRef, setSelectedElement])

  // 获取节点图标
  const getNodeIcon = (type: string): IconName => {
    if (type.includes('Event')) return 'clock'
    if (type.includes('Task')) return 'edit'
    if (type.includes('Gateway')) return 'chevron-right'
    if (type.includes('Flow')) return 'chevron-right'
    return 'document'
  }

  // 渲染单个节点
  const renderNode = (node: ParsedNode, isInGroup = false) => {
    const isExpanded = expandedNodeId === node.id
    const isEditing = editingNodeId === node.id

    return (
      <div 
        key={node.id} 
        className={`node-list-editor__node ${isInGroup ? 'node-list-editor__node--in-group' : ''}`}
      >
        <div className="node-list-editor__node-header">
          <button
            className="node-list-editor__expand-btn"
            onClick={() => handleToggleExpand(node.id)}
          >
            <Icon 
              name={isExpanded ? 'chevron-down' : 'chevron-right'} 
              size={14} 
            />
          </button>
          
          <Icon name={getNodeIcon(node.type)} size={16} className="node-list-editor__node-icon" />
          
          <div className="node-list-editor__node-info">
            {isEditing ? (
              <div className="node-list-editor__edit-form">
                <input
                  type="text"
                  className="node-list-editor__edit-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="节点名称"
                  autoFocus
                />
                <input
                  type="text"
                  className="node-list-editor__edit-input"
                  value={editingIdValue}
                  onChange={(e) => setEditingIdValue(e.target.value)}
                  placeholder="节点ID"
                />
                <div className="node-list-editor__edit-actions">
                  <button
                    className="node-list-editor__edit-btn node-list-editor__edit-btn--save"
                    onClick={handleSaveName}
                  >
                    <Icon name="check" size={12} />
                  </button>
                  <button
                    className="node-list-editor__edit-btn node-list-editor__edit-btn--cancel"
                    onClick={handleCancelEdit}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="node-list-editor__node-name">
                  {node.name || '(无名称)'}
                </div>
                <div className="node-list-editor__node-meta">
                  <span className="node-list-editor__node-id">{node.id}</span>
                  <span className="node-list-editor__node-type">{getNodeTypeName(node.type)}</span>
                </div>
              </>
            )}
          </div>

          {!isEditing && (
            <div className="node-list-editor__node-actions">
              <button
                className="node-list-editor__action-btn"
                onClick={() => handleStartEditName(node)}
                title="编辑"
              >
                <Icon name="edit" size={14} />
              </button>
              <button
                className="node-list-editor__action-btn"
                onClick={() => handleSelectInCanvas(node.id)}
                title="在画布中选中"
              >
                <Icon name="search" size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 展开的详细信息 */}
        {isExpanded && !isEditing && (
          <div className="node-list-editor__node-details">
            <div className="node-list-editor__detail-row">
              <span className="node-list-editor__detail-label">类型:</span>
              <span className="node-list-editor__detail-value">{node.type}</span>
            </div>
            {node.incoming && node.incoming.length > 0 && (
              <div className="node-list-editor__detail-row">
                <span className="node-list-editor__detail-label">输入:</span>
                <span className="node-list-editor__detail-value">{node.incoming.join(', ')}</span>
              </div>
            )}
            {node.outgoing && node.outgoing.length > 0 && (
              <div className="node-list-editor__detail-row">
                <span className="node-list-editor__detail-label">输出:</span>
                <span className="node-list-editor__detail-value">{node.outgoing.join(', ')}</span>
              </div>
            )}
            {node.properties.documentation && (
              <div className="node-list-editor__detail-row">
                <span className="node-list-editor__detail-label">文档:</span>
                <span className="node-list-editor__detail-value">{node.properties.documentation}</span>
              </div>
            )}
            {node.properties.conditionExpression && (
              <div className="node-list-editor__detail-row">
                <span className="node-list-editor__detail-label">条件:</span>
                <span className="node-list-editor__detail-value">{node.properties.conditionExpression}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // 渲染列表视图
  const renderListView = () => (
    <div className="node-list-editor__list">
      {filteredNodes.length === 0 ? (
        <div className="node-list-editor__empty">
          <Icon name="document" size={32} />
          <span>没有找到节点</span>
        </div>
      ) : (
        filteredNodes.map(node => renderNode(node))
      )}
    </div>
  )

  // 渲染分组视图
  const renderGroupView = () => (
    <div className="node-list-editor__groups">
      {Object.keys(filteredNodesByType).length === 0 ? (
        <div className="node-list-editor__empty">
          <Icon name="document" size={32} />
          <span>没有找到节点</span>
        </div>
      ) : (
        Object.entries(filteredNodesByType).map(([type, nodes]) => (
          <div key={type} className="node-list-editor__group">
            <div className="node-list-editor__group-header">
              <Icon name={getNodeIcon(`bpmn:${type}`)} size={16} />
              <span className="node-list-editor__group-title">
                {getNodeTypeName(`bpmn:${type}`)}
              </span>
              <span className="node-list-editor__group-count">{nodes.length}</span>
            </div>
            <div className="node-list-editor__group-content">
              {nodes.map(node => renderNode(node, true))}
            </div>
          </div>
        ))
      )}
    </div>
  )

  return (
    <div className={`node-list-editor ${className || ''}`}>
      <div className="node-list-editor__header">
        <h3 className="node-list-editor__title">
          <Icon name="list" size={16} />
          节点列表
        </h3>
        <div className="node-list-editor__header-actions">
          <button
            className={`node-list-editor__view-btn ${viewMode === 'list' ? 'node-list-editor__view-btn--active' : ''}`}
            onClick={() => setViewMode('list')}
            title="列表视图"
          >
            <Icon name="list" size={14} />
          </button>
          <button
            className={`node-list-editor__view-btn ${viewMode === 'group' ? 'node-list-editor__view-btn--active' : ''}`}
            onClick={() => setViewMode('group')}
            title="分组视图"
          >
            <Icon name="folder" size={14} />
          </button>
        </div>
      </div>

      <div className="node-list-editor__search">
        <Icon name="search" size={14} />
        <input
          type="text"
          className="node-list-editor__search-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索节点..."
        />
        {searchText && (
          <button
            className="node-list-editor__search-clear"
            onClick={() => setSearchText('')}
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="node-list-editor__content">
        {viewMode === 'list' ? renderListView() : renderGroupView()}
      </div>

      <div className="node-list-editor__footer">
        <span className="node-list-editor__count">
          共 {allNodes.length} 个节点
        </span>
      </div>
    </div>
  )
}

export default NodeListEditor