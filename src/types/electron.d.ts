// Electron preload API 类型定义

import type { FfmpegApi } from '../shared/electron/ffmpegApi'

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
  ffmpeg: FfmpegApi
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
