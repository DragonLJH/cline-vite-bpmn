// Electron preload API 类型定义

interface FfmpegProgress {
  frame?: number
  fps?: number
  bitrate?: string
  time?: string
  speed?: string
  percent?: number
}

interface FfmpegProgressPayload {
  taskId: string
  progress: FfmpegProgress
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

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
