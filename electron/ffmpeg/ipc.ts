import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type {
  FfmpegCancelRequest,
  FfmpegCreateConcatListRequest,
  FfmpegCreateOutputPathRequest,
  FfmpegPreviewJobCommandRequest,
  FfmpegProbeRequest,
  FfmpegReadPreviewAsDataUrlRequest,
  FfmpegRunJobRequest,
  FfmpegRunRawRequest,
  FfmpegSnapshotRequest
} from '../../src/shared/electron/ffmpegApi'
import { createConcatListPath, createOutputPath, createPreviewPath } from './ffmpegPaths'
import { ffmpegManager } from './ffmpegManager'

function formatArgs(args: string[]): string {
  return args.map(arg => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
}

export function registerFfmpegIpcHandlers(): void {
  ipcMain.handle('ffmpeg:probe', async (event, payload: FfmpegProbeRequest) => {
    try {
      const taskId = payload.taskId || `probe_${Date.now()}`
      const sender = event.sender
      return await ffmpegManager.probe(payload.inputPath, {
        onPartial: (info) => {
          sender.send('ffmpeg:probePartial', {
            taskId,
            inputPath: payload.inputPath,
            info
          })
        }
      })
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  const runRawHandler = async (
    event: Electron.IpcMainInvokeEvent,
    payload: FfmpegRunRawRequest
  ) => {
    const taskId = payload.taskId || `task_${Date.now()}`
    const sender = event.sender
    console.log(`[ffmpeg:runRaw][${taskId}] ffmpeg ${formatArgs(payload.args)}`)

    try {
      return await ffmpegManager.runRaw(payload.args, taskId, {
        duration: payload.duration,
        onProgress: (data) => {
          sender.send('ffmpeg:progress', {
            taskId: data.taskId,
            progress: data.progress
          })
        }
      })
    } catch (error) {
      return {
        success: false,
        code: null,
        stdout: '',
        stderr: (error as Error).message,
        errorReason: (error as Error).message,
        taskId
      }
    }
  }

  ipcMain.handle('ffmpeg:runRaw', runRawHandler)
  ipcMain.handle('ffmpeg:run', runRawHandler)

  ipcMain.handle('ffmpeg:runJob', async (event, payload: FfmpegRunJobRequest) => {
    const sender = event.sender
    return ffmpegManager.executeJob(
      payload.config,
      payload.inputPath,
      payload.outputPath,
      payload.taskId,
      {
        duration: payload.duration,
        resolvedImages: payload.overlayImages,
        onProgress: (data) => {
          sender.send('ffmpeg:progress', {
            taskId: data.taskId,
            progress: data.progress
          })
        }
      }
    )
  })

  ipcMain.handle('ffmpeg:previewJobCommand', async (_event, payload: FfmpegPreviewJobCommandRequest) => {
    try {
      const result = ffmpegManager.previewJobCommand(
        payload.config,
        payload.inputPath,
        payload.outputPath,
        payload.overlayImages
      )
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('ffmpeg:createOutputPath', async (_event, payload: FfmpegCreateOutputPathRequest) => {
    try {
      const outputPath = createOutputPath(payload.stepId, payload.ext || 'mp4')
      return { success: true, path: outputPath }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('ffmpeg:createConcatList', async (_event, payload: FfmpegCreateConcatListRequest) => {
    try {
      if (payload.filePaths.length === 0) {
        return { success: false, error: '请选择需要合并的文件' }
      }
      return { success: true, path: createConcatListPath(payload.filePaths) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('ffmpeg:cancel', async (_event, payload: FfmpegCancelRequest) => {
    return ffmpegManager.cancel(payload.taskId)
  })

  ipcMain.handle('ffmpeg:snapshot', async (_event, payload: FfmpegSnapshotRequest) => {
    try {
      const timeValue = payload.time ?? '0'
      const time = typeof timeValue === 'number' ? String(timeValue) : timeValue
      const outputPath = createPreviewPath(payload.inputPath, time)

      const result = payload.accurate
        ? await ffmpegManager.screenshotAccurate(payload.inputPath, time, outputPath)
        : await ffmpegManager.screenshot(payload.inputPath, time, outputPath)

      if (!result.success) {
        return { success: false, error: result.error || '截帧失败' }
      }

      return { success: true, path: outputPath, time }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('ffmpeg:readPreviewAsDataUrl', async (_event, payload: FfmpegReadPreviewAsDataUrlRequest) => {
    try {
      if (!fs.existsSync(payload.filePath)) {
        return { success: false, error: '预览文件不存在' }
      }
      const buffer = fs.readFileSync(payload.filePath)
      const ext = path.extname(payload.filePath).toLowerCase()
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
      const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
      return { success: true, dataUrl }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
