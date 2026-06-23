import type { FfmpegJobConfig } from '../ffmpeg'

export interface FfmpegProgress {
  frame?: number
  fps?: number
  bitrate?: string
  time?: string
  speed?: string
  percent?: number
}

export interface FfmpegProgressPayload {
  taskId: string
  progress: FfmpegProgress
}

export interface FfmpegMediaInfo {
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

export interface FfmpegProbeRequest {
  inputPath: string
}

export interface FfmpegProbeResult {
  success: boolean
  info?: FfmpegMediaInfo
  error?: string
  code?: number | null
}

export interface FfmpegRunRawRequest {
  args: string[]
  taskId?: string
  duration?: number
}

export interface FfmpegRunResult {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  errorReason?: string
  taskId?: string
  outputPath?: string
}

export interface FfmpegRunJobRequest {
  config: FfmpegJobConfig
  inputPath: string
  outputPath: string
  taskId: string
  duration?: number
  overlayImages?: string[]
}

export interface FfmpegPreviewJobCommandRequest {
  config: FfmpegJobConfig
  inputPath?: string
  outputPath?: string
  overlayImages?: string[]
}

export interface FfmpegPreviewJobCommandResult {
  success: boolean
  command?: string
  args?: string[]
  error?: string
}

export interface FfmpegCreateOutputPathRequest {
  stepId: string
  ext?: string
}

export interface FfmpegCreateOutputPathResult {
  success: boolean
  path?: string
  error?: string
}

export interface FfmpegCreateConcatListRequest {
  filePaths: string[]
}

export interface FfmpegCreateConcatListResult {
  success: boolean
  path?: string
  error?: string
}

export interface FfmpegCancelRequest {
  taskId: string
}

export interface FfmpegCancelResult {
  success: boolean
  error?: string
}

export interface FfmpegSnapshotRequest {
  inputPath: string
  time?: string | number
  accurate?: boolean
}

export interface FfmpegSnapshotResult {
  success: boolean
  path?: string
  time?: string
  error?: string
}

export interface FfmpegReadPreviewAsDataUrlRequest {
  filePath: string
}

export interface FfmpegReadPreviewAsDataUrlResult {
  success: boolean
  dataUrl?: string
  error?: string
}

export interface FfmpegApi {
  probe: (payload: FfmpegProbeRequest) => Promise<FfmpegProbeResult>
  runRaw: (payload: FfmpegRunRawRequest) => Promise<FfmpegRunResult>
  /** @deprecated 使用 runRaw */
  run: (payload: FfmpegRunRawRequest) => Promise<FfmpegRunResult>
  runJob: (payload: FfmpegRunJobRequest) => Promise<FfmpegRunResult>
  previewJobCommand: (payload: FfmpegPreviewJobCommandRequest) => Promise<FfmpegPreviewJobCommandResult>
  createOutputPath: (payload: FfmpegCreateOutputPathRequest) => Promise<FfmpegCreateOutputPathResult>
  createConcatList: (payload: FfmpegCreateConcatListRequest) => Promise<FfmpegCreateConcatListResult>
  cancel: (payload: FfmpegCancelRequest) => Promise<FfmpegCancelResult>
  snapshot: (payload: FfmpegSnapshotRequest) => Promise<FfmpegSnapshotResult>
  readPreviewAsDataUrl: (payload: FfmpegReadPreviewAsDataUrlRequest) => Promise<FfmpegReadPreviewAsDataUrlResult>
  onProgress: (callback: (data: FfmpegProgressPayload) => void) => () => void
}
