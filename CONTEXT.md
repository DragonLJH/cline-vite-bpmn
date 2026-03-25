# BPMN流程设计器 - AI上下文文档

## 项目概述

基于bpmn-js构建的BPMN 2.0可视化流程设计器，采用React + TypeScript + Zustand技术栈。

## 核心架构

### 分层架构（UI/Store/Service）
```
UI层 → Store层 → Service层
 ↓        ↓         ↓
组件    Zustand   业务逻辑
```

### 目录结构
```
src/
├── pages/bpmn/              # BPMN页面
│   ├── components/          # UI组件
│   │   ├── BpmnDesigner/    # 画布组件
│   │   ├── PropertiesPanel/ # 属性面板
│   │   ├── ProcessList/     # 流程列表
│   │   └── Toolbar/         # 工具栏
│   ├── page.tsx             # 主页面
│   └── index.tsx            # 路由入口
├── stores/bpmnStore.ts      # 状态管理
├── services/bpmn/           # 服务层
└── types/bpmn.d.ts          # 类型定义
```

## 重点代码实现

### 1. BpmnStore状态管理（核心）

```typescript
// stores/bpmnStore.ts - 重点代码
interface BpmnState {
  processList: ProcessDefinition[]      // 流程列表
  currentProcessId: string | null       // 当前流程ID
  bpmnXml: string                       // 当前BPMN XML
  selectedElement: BpmnElement | null   // 选中的元素
  modelerRef: any                       // bpmn-js实例引用
  hasUnsavedChanges: boolean            // 全局未保存状态
  // ... 其他状态
}

// 关键方法
updateElementProperty: (elementId, property, value) => {
  const modeler = get().modelerRef
  const elementRegistry = modeler.get('elementRegistry')
  const modeling = modeler.get('modeling')
  const element = elementRegistry.get(elementId)
  modeling.updateProperties(element, { [property]: value })
}
```

### 2. 属性面板保存逻辑（重点优化）

```typescript
// components/PropertiesPanel/index.tsx - 核心逻辑
const PropertiesPanel = () => {
  const [hasChanges, setHasChanges] = useState(false)  // 本地修改状态
  
  // 修改时只更新本地状态，不应用到画布
  const handleNameChange = (newName: string) => {
    setElementName(newName)
    setHasChanges(true)  // 标记有修改
  }
  
  // 保存时才应用到画布
  const handleSave = () => {
    const modeler = useBpmnStore.getState().modelerRef
    const modeling = modeler.get('modeling')
    const element = elementRegistry.get(selectedElement.id)
    
    // 批量更新属性
    modeling.updateProperties(element, { name: elementName })
    setHasUnsavedChanges(true)  // 标记全局未保存
    setHasChanges(false)        // 清除本地修改状态
  }
  
  // 放弃修改，恢复原始值
  const handleDiscard = () => {
    setElementName(selectedElement.name || '')
    setHasChanges(false)
  }
}
```

### 3. BpmnDesigner画布组件

```typescript
// components/BpmnDesigner/index.tsx - 重点
const BpmnDesigner = React.forwardRef((props, ref) => {
  const modelerRef = useRef<BpmnModeler | null>(null)
  
  // 初始化时保存modeler到store
  useEffect(() => {
    const modeler = new BpmnModeler({ container: containerRef.current })
    modelerRef.current = modeler
    setModelerRef(modeler)  // 关键：保存到全局store
    
    // 监听选择变化
    modeler.on('selection.changed', (event) => {
      const element = event.newSelection[0]
      setSelectedElement({ id: element.id, type: element.type, name: element.businessObject?.name })
    })
  }, [])
})
```

### 4. 流程切换确认逻辑

```typescript
// page.tsx - 切换流程时的确认
const handleSelectProcess = (process: ProcessDefinition) => {
  if (hasUnsavedChanges) {
    const shouldSave = window.confirm(
      `当前流程有未保存的修改。\n\n点击"确定"保存并切换\n点击"取消"放弃修改并切换`
    )
    if (shouldSave) handleSave()
  }
  
  setCurrentProcessId(process.id)
  setBpmnXml(process.bpmnXml)
  setHasUnsavedChanges(false)
}
```

### 5. 工具栏保存按钮（条件显示）

```typescript
// components/Toolbar/index.tsx
{hasUnsavedChanges && (
  <button
    className={`toolbar__btn toolbar__btn--save toolbar__btn--${saveStatus}`}
    onClick={handleSave}
    disabled={saveStatus === 'saving'}
  >
    {saveStatus === 'saving' ? '⏳ 保存中...' : '💾 保存'}
  </button>
)}
```

## 状态管理流程

```
用户修改属性
    ↓
PropertiesPanel本地状态更新
    ↓
点击"保存到节点"按钮
    ↓
调用modeling.updateProperties()
    ↓
画布节点更新
    ↓
setHasUnsavedChanges(true)
    ↓
工具栏显示保存按钮
    ↓
点击保存 → 保存到流程列表
```

## 关键设计决策

### 1. 属性面板双层状态
- **本地状态**：用户修改时不立即应用
- **全局状态**：点击保存后才标记为已修改

### 2. Modeler实例共享
- 保存在Zustand store中
- 各组件通过store访问bpmn-js API

### 3. 流程级别保存
- 每个流程节点的修改独立
- 切换节点时重置修改状态

## 依赖包

```json
{
  "bpmn-js": "^18.13.2",
  "bpmn-js-properties-panel": "^5.53.0",
  "bpmn-moddle": "^10.0.0",
  "zustand": "^5.0.9"
}
```

## 路由配置

路由：`/bpmn`

自动发现：`src/router/index.ts` 使用 `import.meta.glob('../pages/*/index.tsx')`

## 样式系统

- SCSS + BEM命名规范
- 响应式设计（768px断点）
- 深色模式支持

## 已知限制

1. PNG导出需要额外依赖（html2canvas）
2. 事件和网关的高级配置简化处理
3. 协作图（Collaboration）暂未完全支持

## 扩展点

1. 添加更多BPMN元素类型支持
2. 集成后端API实现流程部署
3. 添加流程实例监控
4. 扩展属性面板配置项