import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type LogLevel = 'info' | 'warn' | 'error'

function getLogFilePath(): string {
  const baseDir = app?.getPath ? app.getPath('userData') : process.cwd()
  const logDir = path.join(baseDir, 'logs')
  fs.mkdirSync(logDir, { recursive: true })
  return path.join(logDir, 'app.log')
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  try {
    const payload = meta ? ` ${JSON.stringify(meta)}` : ''
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${payload}\n`
    fs.appendFileSync(getLogFilePath(), line, 'utf8')
  } catch (error) {
    console.warn('[appLogger] Failed to write log:', error)
  }
}

export const appLogger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta)
}
