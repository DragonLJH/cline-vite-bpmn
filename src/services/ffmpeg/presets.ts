import type { FfmpegJobConfig } from './jobConfig'

import { getJobOutputFormat } from './jobConfig'

import { buildJobCommand, previewJobCommand, formatFfmpegCommandPreview } from './jobCommandBuilder'



/** @deprecated 使用 resolveJobInput */

export function resolveVariable(expression: string | undefined, context: Record<string, unknown>): string | undefined {

  if (!expression) return undefined

  const trimmed = expression.trim()

  const match = trimmed.match(/^\$\{(.+)\}$/)

  const key = match ? match[1] : trimmed

  const value = context[key]

  if (value === undefined || value === null) return undefined

  if (typeof value === 'object') return undefined

  return String(value)

}



export function buildFfmpegArgs(config: FfmpegJobConfig, inputPath = '/path/to/input.mp4'): string[] {

  return buildJobCommand(config, inputPath)

}



export function getOutputExtension(config: FfmpegJobConfig): string {

  return getJobOutputFormat(config)

}



export function previewFfmpegCommand(

  config: FfmpegJobConfig,

  inputPath: string = '/path/to/input.mp4',

  outputPath: string = '/path/to/output.mp4'

): string {

  return previewJobCommand(config, inputPath, outputPath)

}



export { buildJobCommand as buildFfmpegCommand, formatFfmpegCommandPreview, previewJobCommand } from './jobCommandBuilder'



export function buildOperationArgs(_config: FfmpegJobConfig): string[] {

  return []

}



export function resolveWatermarkPath(_config: FfmpegJobConfig, fallback: string = '/path/to/watermark.png'): string {

  return fallback

}


