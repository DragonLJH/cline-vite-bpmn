import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

interface FfmpegProgressPayload {
  taskId: string
  progress: {
    frame?: number
    fps?: number
    bitrate?: string
    time?: string
    speed?: string
    percent?: number
  }
}

interface FfmpegProbeResult {
  success: boolean
  info?: {
    duration?: string
    durationSeconds?: number
    width?: number
    height?: number
    fps?: number
    videoCodec?: string
    audioCodec?: string
    bitrate?: string
    raw?: string
  }
  error?: string
}

interface FfmpegRunResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  errorReason?: string
  taskId?: string
}

// 自定义 API 接口定义
interface ElectronAPI {
  platform: string
  version: string
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  toggleMaximize: () => void
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
  showNotification: (options: {
    title: string
    body: string
    icon?: string
  }) => void
  clipboard: {
    readText: () => string
    writeText: (text: string) => void
  }
  appInfo: {
    name: string
    version: string
    isDev: boolean
  }
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
  ffmpeg: {
    probe: (payload: { inputPath: string }) => Promise<FfmpegProbeResult>
    run: (payload: { args: string[]; taskId?: string; duration?: number }) => Promise<FfmpegRunResult>
    runJob: (payload: {
      config: Record<string, unknown>
      inputPath: string
      outputPath: string
      taskId: string
      duration?: number
      overlayImages?: string[]
    }) => Promise<FfmpegRunResult & { outputPath?: string }>
    createOutputPath: (payload: { stepId: string; ext?: string }) => Promise<{ success: boolean; path?: string; error?: string }>
    cancel: (payload: { taskId: string }) => Promise<{ success: boolean; error?: string }>
    snapshot: (payload: {
      inputPath: string
      time?: string | number
      accurate?: boolean
    }) => Promise<{ success: boolean; path?: string; time?: string; error?: string }>
    readPreviewAsDataUrl: (payload: {
      filePath: string
    }) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
    onProgress: (callback: (data: FfmpegProgressPayload) => void) => () => void
  }
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
}

const EVENT_CHANNELS = ['window:maximized', 'window:unmaximized', 'theme:changed', 'ffmpeg:progress']

const electronAPI: ElectronAPI = {
  platform: process.platform,
  version: process.versions.electron,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  showNotification: (options) => ipcRenderer.invoke('notification:show', options),
  clipboard: {
    readText: () => ipcRenderer.sendSync('clipboard:readText'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text)
  },
  appInfo: {
    name: 'Cline Vite App',
    version: '1.0.0',
    isDev: process.env.NODE_ENV === 'development'
  },
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
  ffmpeg: {
    probe: (payload) => ipcRenderer.invoke('ffmpeg:probe', payload),
    run: (payload) => ipcRenderer.invoke('ffmpeg:run', payload),
    runJob: (payload) => ipcRenderer.invoke('ffmpeg:runJob', payload),
    createOutputPath: (payload) => ipcRenderer.invoke('ffmpeg:createOutputPath', payload),
    cancel: (payload) => ipcRenderer.invoke('ffmpeg:cancel', payload),
    snapshot: (payload) => ipcRenderer.invoke('ffmpeg:snapshot', payload),
    readPreviewAsDataUrl: (payload) => ipcRenderer.invoke('ffmpeg:readPreviewAsDataUrl', payload),
    onProgress: (callback) => {
      const handler = (_event: IpcRendererEvent, data: FfmpegProgressPayload) => callback(data)
      ipcRenderer.on('ffmpeg:progress', handler)
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler)
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (EVENT_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, callback)
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (EVENT_CHANNELS.includes(channel)) {
      ipcRenderer.off(channel, callback)
    }
  },
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    if (EVENT_CHANNELS.includes(channel)) {
      ipcRenderer.once(channel, callback)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
