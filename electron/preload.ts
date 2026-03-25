import { contextBridge, ipcRenderer } from 'electron'

// 自定义 API 接口定义
interface ElectronAPI {
  // 系统信息
  platform: string
  version: string

  // 窗口控制
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  toggleMaximize: () => void

  // 文件操作
  openFileDialog: (options?: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
    properties?: string[]
  }) => Promise<string[] | null>

  saveFileDialog: (options?: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
    defaultPath?: string
  }) => Promise<string | null>

  // 通知
  showNotification: (options: {
    title: string
    body: string
    icon?: string
  }) => void

  // 剪贴板
  clipboard: {
    readText: () => string
    writeText: (text: string) => void
  }

  // 应用信息
  appInfo: {
    name: string
    version: string
    isDev: boolean
  }

  // BPMN文件系统操作
  bpmn: {
    initDataDir: () => Promise<{ success: boolean; baseDir?: string }>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
    listFiles: (dirPath: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
    exists: (filePath: string) => Promise<boolean>
    exportData: (data: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
    importData: () => Promise<{ success: boolean; content?: string }>
    openFile: () => Promise<{ success: boolean; content?: string; fileName?: string }>
    saveFile: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string }>
  }

  // 事件监听
  on: (channel: string, callback: (...args: any[]) => void) => void
  off: (channel: string, callback: (...args: any[]) => void) => void
  once: (channel: string, callback: (...args: any[]) => void) => void
}

// 安全的 API 实现
const electronAPI: ElectronAPI = {
  // 系统信息
  platform: process.platform,
  version: process.versions.electron,

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),

  // 文件对话框
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  // 通知
  showNotification: (options) => ipcRenderer.invoke('notification:show', options),

  // 剪贴板
  clipboard: {
    readText: () => ipcRenderer.sendSync('clipboard:readText'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text)
  },

  // 应用信息
  appInfo: {
    name: 'Cline Vite App',
    version: '1.0.0',
    isDev: process.env.NODE_ENV === 'development'
  },

  // BPMN文件系统操作
  bpmn: {
    initDataDir: () => ipcRenderer.invoke('bpmn:initDataDir'),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('bpmn:writeFile', filePath, content),
    readFile: (filePath: string) => ipcRenderer.invoke('bpmn:readFile', filePath),
    deleteFile: (filePath: string) => ipcRenderer.invoke('bpmn:deleteFile', filePath),
    listFiles: (dirPath: string) => ipcRenderer.invoke('bpmn:listFiles', dirPath),
    exists: (filePath: string) => ipcRenderer.invoke('bpmn:exists', filePath),
    exportData: (data: string, defaultName: string) => ipcRenderer.invoke('bpmn:exportData', data, defaultName),
    importData: () => ipcRenderer.invoke('bpmn:importData'),
    openFile: () => ipcRenderer.invoke('bpmn:openFile'),
    saveFile: (content: string, defaultName: string) => ipcRenderer.invoke('bpmn:saveFile', content, defaultName)
  },

  // 事件监听 (只允许安全的频道)
  on: (channel: string, callback: (...args: any[]) => void) => {
    const allowedChannels = ['window:maximized', 'window:unmaximized', 'theme:changed']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, callback)
    }
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    const allowedChannels = ['window:maximized', 'window:unmaximized', 'theme:changed']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.off(channel, callback)
    }
  },

  once: (channel: string, callback: (...args: any[]) => void) => {
    const allowedChannels = ['window:maximized', 'window:unmaximized', 'theme:changed']
    if (allowedChannels.includes(channel)) {
      ipcRenderer.once(channel, callback)
    }
  }
}

// 将 API 暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明 (在全局声明文件中使用)
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
