import { app, BrowserWindow, ipcMain, dialog, Notification, clipboard } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

function createWindow() {
  // 获取 preload 脚本路径
  const preloadPath = path.join(app.getAppPath(), 'dist', 'electron', 'preload.js')

  // 根据平台配置窗口选项
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    // Windows 平台使用自定义标题栏
    ...(process.platform === 'win32' && {
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: false
    }),
    // macOS 保留原生标题栏
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hiddenInset'
    }),
    // Linux 根据需要配置
    ...(process.platform === 'linux' && {
      frame: true
    })
  }

  const mainWindow = new BrowserWindow(windowOptions)

  // 开发模式打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  // 开发模式加载 Vite 服务器，生产模式加载打包文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    // 在生产模式下，从应用目录加载 index.html
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
    // 将路径转换为 file:// URL 格式，确保跨平台兼容性
    const fileUrl = `file://${indexPath.replace(/\\/g, '/')}`
    mainWindow.loadURL(fileUrl)
  }
}

// IPC 处理程序
ipcMain.handle('window:minimize', () => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  focusedWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  focusedWindow?.maximize()
})

ipcMain.handle('window:close', () => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  focusedWindow?.close()
})

ipcMain.handle('window:toggle-maximize', () => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow?.isMaximized()) {
    focusedWindow.unmaximize()
  } else {
    focusedWindow?.maximize()
  }
})

// 文件对话框
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
    title: options?.title || '选择文件',
    filters: options?.filters,
    properties: options?.properties || ['openFile']
  })
  return result.canceled ? null : result.filePaths
})

ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
    title: options?.title || '保存文件',
    filters: options?.filters,
    defaultPath: options?.defaultPath
  })
  return result.canceled ? null : result.filePath
})

// 通知
ipcMain.handle('notification:show', (event, options) => {
  new Notification({
    title: options.title,
    body: options.body,
    icon: options.icon
  }).show()
})

// 剪贴板
ipcMain.on('clipboard:readText', (event) => {
  event.returnValue = clipboard.readText()
})

ipcMain.handle('clipboard:writeText', (event, text) => {
  clipboard.writeText(text)
})

// ========== BPMN 文件系统操作 ==========

// BPMN数据目录
const getBpmnDataDir = () => {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'bpmn-data')
}

// 确保目录存在
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// 初始化BPMN数据目录
ipcMain.handle('bpmn:initDataDir', async () => {
  const baseDir = getBpmnDataDir()
  const dirs = [
    path.join(baseDir, 'process-definitions', 'definitions'),
    path.join(baseDir, 'process-instances', 'running'),
    path.join(baseDir, 'process-instances', 'completed'),
    path.join(baseDir, 'tasks', 'pending'),
    path.join(baseDir, 'tasks', 'completed')
  ]
  dirs.forEach(ensureDir)
  return { success: true, baseDir }
})

// 写入文件
ipcMain.handle('bpmn:writeFile', async (event, filePath: string, content: string) => {
  try {
    const fullPath = path.join(getBpmnDataDir(), filePath)
    const dir = path.dirname(fullPath)
    ensureDir(dir)
    fs.writeFileSync(fullPath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 读取文件
ipcMain.handle('bpmn:readFile', async (event, filePath: string) => {
  try {
    const fullPath = path.join(getBpmnDataDir(), filePath)
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: '文件不存在' }
    }
    const content = fs.readFileSync(fullPath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 删除文件
ipcMain.handle('bpmn:deleteFile', async (event, filePath: string) => {
  try {
    const fullPath = path.join(getBpmnDataDir(), filePath)
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 列出目录文件
ipcMain.handle('bpmn:listFiles', async (event, dirPath: string) => {
  try {
    const fullPath = path.join(getBpmnDataDir(), dirPath)
    if (!fs.existsSync(fullPath)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(fullPath)
    return { success: true, files }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 检查文件是否存在
ipcMain.handle('bpmn:exists', async (event, filePath: string) => {
  const fullPath = path.join(getBpmnDataDir(), filePath)
  return fs.existsSync(fullPath)
})

// 导出BPMN数据
ipcMain.handle('bpmn:exportData', async (event, data: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
    title: '导出BPMN数据',
    defaultPath: defaultName,
    filters: [
      { name: 'JSON文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return { success: true, filePath: result.filePath }
  }
  return { success: false }
})

// 导入BPMN数据
ipcMain.handle('bpmn:importData', async () => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
    title: '导入BPMN数据',
    filters: [
      { name: 'JSON文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8')
    return { success: true, content }
  }
  return { success: false }
})

// 打开BPMN文件
ipcMain.handle('bpmn:openFile', async () => {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
    title: '打开BPMN文件',
    filters: [
      { name: 'BPMN文件', extensions: ['bpmn', 'xml'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8')
    const fileName = path.basename(result.filePaths[0])
    return { success: true, content, fileName }
  }
  return { success: false }
})

// 保存BPMN文件
ipcMain.handle('bpmn:saveFile', async (event, content: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow()!, {
    title: '保存BPMN文件',
    defaultPath: defaultName,
    filters: [
      { name: 'BPMN文件', extensions: ['bpmn'] },
      { name: 'XML文件', extensions: ['xml'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  }
  return { success: false }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
