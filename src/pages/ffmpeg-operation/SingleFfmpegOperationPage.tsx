import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FfmpegMediaInfo } from '../../shared/electron/ffmpegApi'
import type { FfmpegJobAction, FfmpegJobConfig, FfmpegJobFilter } from '../../services/ffmpeg'
import {
  AUDIO_CODEC_OPTIONS,
  FFMPEG_ACTION_LABELS,
  PRESET_OPTIONS,
  VIDEO_CODEC_OPTIONS,
  previewJobCommand,
  serializeFfmpegJobConfig
} from '../../services/ffmpeg'
import { toLocalMediaUrl } from '../../services/ffmpeg/coordinateUtils'
import { formatSecondsToFfmpegTime, formatSecondsToTime, parseTimeToSeconds } from '../../services/ffmpeg/timeUtils'
import { readPreviewAsDataUrl } from '../../services/ffmpeg/previewUtils'
import TrimTimeline from '../../components/ffmpeg/TrimTimeline'
import SeekTimeline from '../../components/ffmpeg/SeekTimeline'
import CropCanvas from '../../components/ffmpeg/CropCanvas'
import {
  findKeyframeIndexAtTime,
  resolveCropAtTime,
  sortCropKeyframes
} from '../../shared/ffmpeg/cropKeyframes'
import type { FfmpegJobCropKeyframe } from '../../services/ffmpeg'
import { mergeMediaInfo } from '../ffmpeg-probe/mergeMediaInfo'
import './index.scss'

export interface FfmpegOperationPageSpec {
  action: FfmpegJobAction
  title: string
  description: string
  path: string
  icon: string
}

export const FFMPEG_OPERATION_PAGE_SPECS: Record<FfmpegJobAction, FfmpegOperationPageSpec> = {
  probe: {
    action: 'probe',
    title: 'FFmpeg 探测',
    description: '读取媒体流、编码、时长等基础信息',
    path: '/ffmpeg-probe',
    icon: '🔎'
  },
  trim: {
    action: 'trim',
    title: 'FFmpeg 时间截取',
    description: '按开始时间和持续时长截取音视频片段',
    path: '/ffmpeg-trim',
    icon: '✂️'
  },
  crop: {
    action: 'crop',
    title: 'FFmpeg 画面裁剪',
    description: '拖拽视频四边裁切画面区域，输出指定宽高片段',
    path: '/ffmpeg-crop',
    icon: '🖼️'
  },
  transcode: {
    action: 'transcode',
    title: 'FFmpeg 转码',
    description: '调整封装格式、视频编码、音频编码和质量参数',
    path: '/ffmpeg-transcode',
    icon: '🎞️'
  },
  watermark: {
    action: 'watermark',
    title: 'FFmpeg 水印',
    description: '给视频叠加图片水印，支持位置和缩放设置',
    path: '/ffmpeg-watermark',
    icon: '💧'
  },
  extractAudio: {
    action: 'extractAudio',
    title: 'FFmpeg 提取音频',
    description: '从视频中抽取音轨并输出为音频文件',
    path: '/ffmpeg-extract-audio',
    icon: '🎧'
  },
  concat: {
    action: 'concat',
    title: 'FFmpeg 合并',
    description: '基于 concat 输入列表合并多个媒体片段',
    path: '/ffmpeg-concat',
    icon: '🧩'
  },
  custom: {
    action: 'custom',
    title: 'FFmpeg 自定义',
    description: '直接维护额外命令参数，覆盖特殊处理场景',
    path: '/ffmpeg-custom',
    icon: '⚙️'
  }
}

const DEFAULT_INPUT_PATH = '/path/to/input.mp4'
const DEFAULT_OUTPUT_PATH = '/path/to/output.mp4'

type RunStatus = 'idle' | 'running' | 'success' | 'failed'
type MediaProbeStatus = 'idle' | 'probing' | 'done' | 'failed'

interface RunState {
  status: RunStatus
  progress?: number
  outputPath?: string
  stdout?: string
  stderr?: string
  error?: string
}

function createDefaultOperationConfig(action: FfmpegJobAction): FfmpegJobConfig {
  const base: FfmpegJobConfig = {
    type: 'ffmpeg',
    action,
    input: { source: 'input', path: DEFAULT_INPUT_PATH },
    output: { format: action === 'extractAudio' ? 'aac' : action === 'probe' ? 'json' : 'mp4', overwrite: true, var: 'output' },
    global: { hideBanner: true, noStdin: true }
  }

  switch (action) {
    case 'trim':
      return {
        ...base,
        trim: { start: '0', duration: '10', copyStream: true, precise: false }
      }
    case 'crop':
      return {
        ...base,
        crop: { x: 0, y: 0, width: 1920, height: 1080 },
        cropAdvanced: { mode: 'static', keyframes: [], interp: 'step' },
        video: { codec: 'libopenh264' },
        audio: { codec: 'copy' }
      }
    case 'transcode':
      return {
        ...base,
        video: { codec: 'libopenh264', crf: 23 },
        audio: { codec: 'aac' }
      }
    case 'watermark':
      return {
        ...base,
        video: { codec: 'libopenh264' },
        audio: { codec: 'copy' },
        filters: [{ type: 'overlay', image: '/path/to/watermark.png', x: 10, y: 10, scale: 0.2 }]
      }
    case 'extractAudio':
      return {
        ...base,
        audio: { codec: 'copy' }
      }
    case 'custom':
      return {
        ...base,
        args: ['-c:v', 'libopenh264', '-c:a', 'aac']
      }
    default:
      return base
  }
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

function splitArgs(value: string): string[] {
  const matches = value.match(/"([^"]*)"|'([^']*)'|\S+/g) || []
  return matches.map(item => item.replace(/^["']|["']$/g, ''))
}

function getOverlayFilter(config: FfmpegJobConfig): Extract<FfmpegJobFilter, { type: 'overlay' }> {
  const current = config.filters?.find(
    (filter): filter is Extract<FfmpegJobFilter, { type: 'overlay' }> => filter.type === 'overlay'
  )
  return current || { type: 'overlay', image: '/path/to/watermark.png', x: 10, y: 10, scale: 0.2 }
}

interface SingleFfmpegOperationPageProps {
  action: FfmpegJobAction
}

const SingleFfmpegOperationPage: React.FC<SingleFfmpegOperationPageProps> = ({ action }) => {
  const spec = FFMPEG_OPERATION_PAGE_SPECS[action]
  const [config, setConfig] = useState<FfmpegJobConfig>(() => createDefaultOperationConfig(action))
  const [copied, setCopied] = useState(false)
  const [commandPreview, setCommandPreview] = useState('')
  const [concatInputs, setConcatInputs] = useState<string[]>([])
  const [runState, setRunState] = useState<RunState>({ status: 'idle' })
  const [probeMediaInfo, setProbeMediaInfo] = useState<FfmpegMediaInfo | null>(null)
  const [probeDisplayStatus, setProbeDisplayStatus] = useState<ProbeDisplayStatus>('idle')
  const [trimMediaInfo, setTrimMediaInfo] = useState<FfmpegMediaInfo | null>(null)
  const [trimProbeStatus, setTrimProbeStatus] = useState<MediaProbeStatus>('idle')
  const [cropMediaInfo, setCropMediaInfo] = useState<FfmpegMediaInfo | null>(null)
  const [cropProbeStatus, setCropProbeStatus] = useState<MediaProbeStatus>('idle')
  const [cropPreviewTime, setCropPreviewTime] = useState(0)
  const [cropPreviewImage, setCropPreviewImage] = useState<string | null>(null)
  const [cropSnapshotLoading, setCropSnapshotLoading] = useState(false)
  const trimVideoRef = useRef<HTMLVideoElement>(null)

  const configJson = useMemo(() => serializeFfmpegJobConfig(config), [config])
  const overlayFilter = getOverlayFilter(config)
  const inputPath = config.input?.path || ''
  const hasValidInput = Boolean(
    inputPath && inputPath !== DEFAULT_INPUT_PATH && !inputPath.endsWith('个文件待合并')
  )
  const trimMediaDuration = trimMediaInfo?.durationSeconds
    || parseTimeToSeconds(trimMediaInfo?.duration)
    || 60
  const trimVideoSrc = action === 'trim' && hasValidInput ? toLocalMediaUrl(inputPath) : null
  const cropVideoSrc = action === 'crop' && hasValidInput ? toLocalMediaUrl(inputPath) : null
  const cropRealW = cropMediaInfo?.width || 1920
  const cropRealH = cropMediaInfo?.height || 1080
  const cropMediaDuration = cropMediaInfo?.durationSeconds
    || parseTimeToSeconds(cropMediaInfo?.duration)
    || 60
  const cropRegion = config.crop || { x: 0, y: 0, width: cropRealW, height: cropRealH }
  const isCropKeyframeMode = config.cropAdvanced?.mode === 'keyframes'
  const cropKeyframeTimes = useMemo(
    () => sortCropKeyframes(config.cropAdvanced?.keyframes || []).map(item => item.time),
    [config.cropAdvanced?.keyframes]
  )
  const cropDisplayRegion = useMemo(() => {
    if (!isCropKeyframeMode) return cropRegion
    return resolveCropAtTime(
      config.cropAdvanced?.keyframes,
      cropPreviewTime,
      cropRegion,
      cropMediaDuration
    )
  }, [
    isCropKeyframeMode,
    config.cropAdvanced?.keyframes,
    cropPreviewTime,
    cropRegion,
    cropMediaDuration
  ])

  useEffect(() => {
    let cancelled = false
    const inputPath = config.input?.path || DEFAULT_INPUT_PATH
    const localPreview = previewJobCommand(config, inputPath, DEFAULT_OUTPUT_PATH)
    setCommandPreview(localPreview)

    const loadPreview = async () => {
      const result = await window.electronAPI?.ffmpeg.previewJobCommand?.({
        config,
        inputPath,
        outputPath: DEFAULT_OUTPUT_PATH,
        overlayImages: config.action === 'watermark' ? [overlayFilter.image] : []
      })
      if (!cancelled && result?.success && result.command) {
        setCommandPreview(result.command)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [config, overlayFilter.image])

  const patchConfig = (patch: Partial<FfmpegJobConfig>) => {
    setConfig(current => ({ ...current, ...patch }))
  }

  const probeTrimMedia = useCallback(async (path: string) => {
    setTrimMediaInfo(null)
    setTrimProbeStatus('probing')

    const ffmpeg = window.electronAPI?.ffmpeg
    if (!ffmpeg?.probe) {
      setTrimProbeStatus('failed')
      return
    }

    try {
      const result = await ffmpeg.probe({ inputPath: path })
      if (!result.success || !result.info) {
        setTrimProbeStatus('failed')
        return
      }

      setTrimMediaInfo(result.info)
      setTrimProbeStatus('done')

      const total = result.info.durationSeconds || parseTimeToSeconds(result.info.duration)
      if (total > 0) {
        setConfig(current => ({
          ...current,
          trim: {
            ...current.trim,
            start: '0',
            duration: formatSecondsToTime(total),
            copyStream: current.trim?.copyStream !== false,
            precise: current.trim?.precise === true
          }
        }))
      }
    } catch {
      setTrimProbeStatus('failed')
    }
  }, [])

  const handleTrimSeekPreview = useCallback((seconds: number) => {
    const video = trimVideoRef.current
    if (!video) return
    video.currentTime = seconds
  }, [])

  useEffect(() => {
    if (action !== 'trim' || !trimVideoSrc) return
    const video = trimVideoRef.current
    if (!video) return
    const startSec = parseTimeToSeconds(config.trim?.start)
    video.currentTime = startSec
  }, [action, trimVideoSrc, config.trim?.start])

  useEffect(() => {
    if (action !== 'trim') return
    if (!hasValidInput) {
      setTrimMediaInfo(null)
      setTrimProbeStatus('idle')
      return
    }
    void probeTrimMedia(inputPath)
  }, [action, hasValidInput, inputPath, probeTrimMedia])

  const probeCropMedia = useCallback(async (path: string) => {
    setCropMediaInfo(null)
    setCropProbeStatus('probing')
    setCropPreviewImage(null)
    setCropPreviewTime(0)

    const ffmpeg = window.electronAPI?.ffmpeg
    if (!ffmpeg?.probe) {
      setCropProbeStatus('failed')
      return
    }

    try {
      const result = await ffmpeg.probe({ inputPath: path })
      if (!result.success || !result.info) {
        setCropProbeStatus('failed')
        return
      }

      setCropMediaInfo(result.info)
      setCropProbeStatus('done')

      const width = result.info.width || 1920
      const height = result.info.height || 1080
      const durationSeconds = result.info.durationSeconds || parseTimeToSeconds(result.info.duration)
      setConfig(current => ({
        ...current,
        crop: { x: 0, y: 0, width, height },
        cropAdvanced: {
          ...current.cropAdvanced,
          durationSeconds: durationSeconds || current.cropAdvanced?.durationSeconds
        }
      }))
    } catch {
      setCropProbeStatus('failed')
    }
  }, [])

  const refreshCropPreview = useCallback(async (seconds: number) => {
    if (!hasValidInput || !window.electronAPI?.ffmpeg?.snapshot) return
    setCropSnapshotLoading(true)
    try {
      const result = await window.electronAPI.ffmpeg.snapshot({
        inputPath,
        time: formatSecondsToFfmpegTime(seconds),
        accurate: true
      })
      if (result.success && result.path) {
        const dataUrl = await readPreviewAsDataUrl(result.path)
        if (dataUrl) {
          setCropPreviewImage(dataUrl)
          setCropPreviewTime(seconds)
        }
      }
    } finally {
      setCropSnapshotLoading(false)
    }
  }, [hasValidInput, inputPath])

  useEffect(() => {
    if (action !== 'crop' || cropProbeStatus !== 'done' || !hasValidInput) return
    void refreshCropPreview(0)
  }, [action, cropProbeStatus, hasValidInput, inputPath, refreshCropPreview])

  useEffect(() => {
    if (action !== 'crop') return
    if (!hasValidInput) {
      setCropMediaInfo(null)
      setCropProbeStatus('idle')
      return
    }
    void probeCropMedia(inputPath)
  }, [action, hasValidInput, inputPath, probeCropMedia])

  const handleCropRegionChange = useCallback((patch: Partial<typeof cropRegion>) => {
    if (isCropKeyframeMode) {
      setConfig(current => {
        const keyframes = [...(current.cropAdvanced?.keyframes || [])]
        const time = cropPreviewTime
        const base = resolveCropAtTime(
          keyframes,
          time,
          current.crop || cropRegion,
          cropMediaDuration
        )
        const nextKeyframe: FfmpegJobCropKeyframe = { time, ...base, ...patch }
        const index = findKeyframeIndexAtTime(keyframes, time)
        if (index >= 0) keyframes[index] = nextKeyframe
        else keyframes.push(nextKeyframe)
        return {
          ...current,
          cropAdvanced: {
            ...current.cropAdvanced,
            mode: 'keyframes',
            interp: 'step',
            durationSeconds: cropMediaDuration,
            keyframes: sortCropKeyframes(keyframes)
          }
        }
      })
      return
    }
    setConfig(current => ({
      ...current,
      crop: { ...(current.crop || cropRegion), ...patch }
    }))
  }, [cropMediaDuration, cropPreviewTime, cropRegion, isCropKeyframeMode])

  const addCropKeyframe = useCallback(() => {
    setConfig(current => {
      const keyframes = [...(current.cropAdvanced?.keyframes || [])]
      if (findKeyframeIndexAtTime(keyframes, cropPreviewTime) >= 0) return current
      keyframes.push({ time: cropPreviewTime, ...cropDisplayRegion })
      return {
        ...current,
        cropAdvanced: {
          mode: 'keyframes',
          interp: 'step',
          durationSeconds: cropMediaDuration,
          keyframes: sortCropKeyframes(keyframes)
        }
      }
    })
  }, [cropDisplayRegion, cropMediaDuration, cropPreviewTime])

  const removeCropKeyframe = useCallback(() => {
    setConfig(current => ({
      ...current,
      cropAdvanced: {
        ...current.cropAdvanced,
        mode: 'keyframes',
        keyframes: (current.cropAdvanced?.keyframes || []).filter(
          item => Math.abs(item.time - cropPreviewTime) > 0.05
        )
      }
    }))
  }, [cropPreviewTime])

  const toggleCropKeyframeMode = useCallback((enabled: boolean) => {
    if (enabled) {
      setConfig(current => ({
        ...current,
        cropAdvanced: {
          mode: 'keyframes',
          interp: 'step',
          durationSeconds: cropMediaDuration,
          keyframes: [{ time: 0, ...(current.crop || cropRegion) }]
        }
      }))
      return
    }
    setConfig(current => ({
      ...current,
      cropAdvanced: {
        mode: 'static',
        keyframes: [],
        interp: 'step',
        durationSeconds: cropMediaDuration
      }
    }))
  }, [cropMediaDuration, cropRegion])

  const updateInput = (patch: NonNullable<FfmpegJobConfig['input']>) => {
    setConfig(current => ({ ...current, input: { ...current.input, ...patch } }))
  }

  const updateOutput = (patch: NonNullable<FfmpegJobConfig['output']>) => {
    setConfig(current => ({ ...current, output: { ...current.output, ...patch } }))
  }

  const updateVideo = (patch: NonNullable<FfmpegJobConfig['video']>) => {
    setConfig(current => ({ ...current, video: { ...current.video, ...patch } }))
  }

  const updateAudio = (patch: NonNullable<FfmpegJobConfig['audio']>) => {
    setConfig(current => ({ ...current, audio: { ...current.audio, ...patch } }))
  }

  const updateOverlay = (patch: Partial<Extract<FfmpegJobFilter, { type: 'overlay' }>>) => {
    setConfig(current => ({
      ...current,
      filters: [{ ...getOverlayFilter(current), ...patch }]
    }))
  }

  const copyConfigJson = async () => {
    await navigator.clipboard?.writeText(configJson)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const selectInputFile = async () => {
    const paths = await window.electronAPI?.openFileDialog({
      title: '选择音视频文件',
      filters: [
        { name: '媒体文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'aac', 'flac', 'm4a'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (paths?.[0]) {
      updateInput({ path: paths[0] })
      setRunState({ status: 'idle' })
      if (action === 'probe') {
        setProbeMediaInfo(null)
        setProbeDisplayStatus('idle')
      }
    }
  }

  const selectConcatFiles = async () => {
    const paths = await window.electronAPI?.openFileDialog({
      title: '选择需要合并的音视频文件',
      filters: [
        { name: '媒体文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'aac', 'flac', 'm4a'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    if (paths?.length) {
      setConcatInputs(paths)
      updateInput({ path: paths.length === 1 ? paths[0] : `${paths.length} 个文件待合并` })
      setRunState({ status: 'idle' })
    }
  }

  const selectWatermarkImage = async () => {
    const paths = await window.electronAPI?.openFileDialog({
      title: '选择水印图片',
      filters: [
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (paths?.[0]) {
      updateOverlay({ image: paths[0] })
    }
  }

  const runOperation = async () => {
    const ffmpeg = window.electronAPI?.ffmpeg
    if (!ffmpeg) {
      setRunState({ status: 'failed', error: 'FFmpeg API 不可用，请在 Electron 环境中运行' })
      return
    }

    const taskId = `single_${action}_${Date.now()}`
    setRunState({ status: 'running', progress: 0 })

    const unsubscribe = ffmpeg.onProgress?.((data) => {
      if (data.taskId !== taskId) return
      if (data.progress.percent == null) return
      setRunState(current => ({
        ...current,
        progress: Math.round(data.progress.percent || 0)
      }))
    })

    try {
      let inputPath = config.input?.path || ''
      if (action === 'concat' && concatInputs.length > 1) {
        const listResult = await ffmpeg.createConcatList({ filePaths: concatInputs })
        if (!listResult.success || !listResult.path) {
          throw new Error(listResult.error || '无法创建合并列表')
        }
        inputPath = listResult.path
      }

      if (!inputPath || inputPath === DEFAULT_INPUT_PATH || inputPath.endsWith('个文件待合并')) {
        throw new Error(action === 'concat' ? '请先选择需要合并的文件' : '请先选择输入音视频文件')
      }

      if (action === 'probe') {
        const probeTaskId = `probe_${Date.now()}`
        setProbeMediaInfo(null)
        setProbeDisplayStatus('probing')
        setRunState({ status: 'running' })

        const unsubscribePartial = ffmpeg.onProbePartial?.((data) => {
          if (data.taskId !== probeTaskId) return
          setProbeMediaInfo(prev => mergeMediaInfo(prev, data.info))
        })

        try {
          const result = await ffmpeg.probe({ inputPath, taskId: probeTaskId })
          const finalInfo = result.info || null
          if (finalInfo) {
            setProbeMediaInfo(finalInfo)
          }
          setProbeDisplayStatus(result.success ? 'done' : 'failed')
          setRunState({
            status: result.success ? 'success' : 'failed',
            progress: result.success ? 100 : 0,
            stdout: finalInfo ? JSON.stringify(finalInfo, null, 2) : undefined,
            stderr: finalInfo?.raw,
            error: result.error
          })
        } finally {
          unsubscribePartial?.()
        }
        return
      }

      const ext = config.output?.format || 'mp4'
      const outputPathResult = await ffmpeg.createOutputPath({ stepId: taskId, ext })
      if (!outputPathResult.success || !outputPathResult.path) {
        throw new Error(outputPathResult.error || '无法创建输出路径')
      }

      const overlayImages = action === 'watermark' ? [overlayFilter.image] : []
      const result = await ffmpeg.runJob({
        config: { ...config, input: { ...config.input, path: inputPath } },
        inputPath,
        outputPath: outputPathResult.path,
        taskId,
        overlayImages
      })

      setRunState({
        status: result.success ? 'success' : 'failed',
        progress: result.success ? 100 : runState.progress,
        outputPath: result.outputPath || outputPathResult.path,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.errorReason
      })
    } catch (error) {
      setRunState({
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : '执行失败'
      })
    } finally {
      unsubscribe?.()
    }
  }

  const renderCodecSelect = (
    label: string,
    value: string | undefined,
    options: readonly { value: string; label: string }[],
    onChange: (value: string) => void
  ) => (
    <label className="ffmpeg-op-page__field">
      <span>{label}</span>
      <select value={value || ''} onChange={event => onChange(event.target.value)}>
        <option value="">不指定</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )

  const probeResultJson = useMemo(() => {
    if (action !== 'probe' || !probeMediaInfo) return ''
    return JSON.stringify(probeMediaInfo, null, 2)
  }, [action, probeMediaInfo])

  const renderOperationFields = () => {
    switch (action) {
      case 'probe':
        return (
          <div className="ffmpeg-op-page__note">
            探测操作不需要输出文件，命令预览会保留全局参数和输入路径，执行结果可作为后续 BPMN 节点的媒体信息来源。
          </div>
        )
      case 'trim':
        return (
          <div className="ffmpeg-op-page__stack">
            {!hasValidInput && (
              <div className="ffmpeg-op-page__note">
                请先选择输入视频，选择后将自动探测时长，并可通过拖拽时间轴边界进行裁剪。
              </div>
            )}
            {hasValidInput && trimProbeStatus === 'probing' && (
              <p className="ffmpeg-op-page__trim-hint">正在探测视频时长…</p>
            )}
            {hasValidInput && trimVideoSrc && (
              <div className="ffmpeg-op-page__trim-preview">
                <video
                  ref={trimVideoRef}
                  className="ffmpeg-op-page__trim-video"
                  src={trimVideoSrc}
                  controls
                  preload="metadata"
                />
              </div>
            )}
            <TrimTimeline
              durationSeconds={trimMediaDuration}
              start={String(config.trim?.start ?? '0')}
              duration={String(config.trim?.duration ?? '10')}
              onChange={patch => patchConfig({ trim: { ...config.trim, ...patch } })}
              onSeekPreview={hasValidInput ? handleTrimSeekPreview : undefined}
              disabled={!hasValidInput || trimProbeStatus === 'probing'}
              durationEstimated={trimProbeStatus !== 'done'}
            />
            <div className="ffmpeg-op-page__grid">
              <label className="ffmpeg-op-page__check">
                <input type="checkbox" checked={config.trim?.copyStream !== false} onChange={event => patchConfig({ trim: { ...config.trim, copyStream: event.target.checked } })} />
                复制码流
              </label>
              <label className="ffmpeg-op-page__check">
                <input type="checkbox" checked={config.trim?.precise === true} onChange={event => patchConfig({ trim: { ...config.trim, precise: event.target.checked } })} />
                精准裁剪
              </label>
            </div>
            {config.trim?.copyStream !== false && (
              <p className="ffmpeg-op-page__trim-hint">流复制模式下裁剪点可能对齐到关键帧，画面略有偏差。</p>
            )}
          </div>
        )
      case 'crop':
        return (
          <div className="ffmpeg-op-page__stack">
            {!hasValidInput && (
              <div className="ffmpeg-op-page__note">
                请先选择输入视频，选择后将自动探测分辨率，拖动时间轴截取预览帧后进行画面裁剪。
              </div>
            )}
            {hasValidInput && cropProbeStatus === 'probing' && (
              <p className="ffmpeg-op-page__trim-hint">正在探测视频分辨率…</p>
            )}
            {hasValidInput && (
              <>
                <label className="ffmpeg-op-page__check">
                  <input
                    type="checkbox"
                    checked={isCropKeyframeMode}
                    onChange={event => toggleCropKeyframeMode(event.target.checked)}
                  />
                  高级模式（关键帧分段裁剪）
                </label>
                {isCropKeyframeMode && (
                  <div className="ffmpeg-op-page__crop-keyframe-actions">
                    <button type="button" onClick={addCropKeyframe}>在当前时间点添加关键帧</button>
                    <button type="button" onClick={removeCropKeyframe}>删除当前关键帧</button>
                    <span>{cropKeyframeTimes.length} 个关键帧</span>
                  </div>
                )}
              </>
            )}
            {hasValidInput && (
              <SeekTimeline
                durationSeconds={cropMediaDuration}
                currentSeconds={cropPreviewTime}
                onSeek={seconds => void refreshCropPreview(seconds)}
                keyframeTimes={isCropKeyframeMode ? cropKeyframeTimes : undefined}
                onKeyframeSelect={seconds => void refreshCropPreview(seconds)}
                disabled={!hasValidInput || cropProbeStatus === 'probing'}
                durationEstimated={cropProbeStatus !== 'done'}
                loading={cropSnapshotLoading}
              />
            )}
            {hasValidInput && (cropPreviewImage || cropVideoSrc) && (
              <CropCanvas
                videoSrc={cropPreviewImage ? null : cropVideoSrc}
                previewImageUrl={cropPreviewImage}
                realW={cropRealW}
                realH={cropRealH}
                crop={cropDisplayRegion}
                onChange={handleCropRegionChange}
                disabled={!hasValidInput || cropProbeStatus === 'probing'}
                resolutionEstimated={cropProbeStatus !== 'done'}
                previewLoading={cropSnapshotLoading}
              />
            )}
            <div className="ffmpeg-op-page__grid">
              {renderCodecSelect('视频编码', config.video?.codec, VIDEO_CODEC_OPTIONS, value => updateVideo({ codec: value }))}
              {renderCodecSelect('音频编码', config.audio?.codec, AUDIO_CODEC_OPTIONS, value => updateAudio({ codec: value }))}
            </div>
            <p className="ffmpeg-op-page__trim-hint">
              {isCropKeyframeMode
                ? '高级模式：相邻关键帧之间按阶跃方式应用不同裁剪区域，最终 concat 合并；时间轴用于预览与打点。'
                : '简单模式：全片使用同一裁剪区域；时间轴仅用于选择预览帧。'}
              执行时需重编码，不支持流复制。
            </p>
          </div>
        )
      case 'transcode':
        return (
          <div className="ffmpeg-op-page__grid">
            {renderCodecSelect('视频编码', config.video?.codec, VIDEO_CODEC_OPTIONS, value => updateVideo({ codec: value }))}
            {renderCodecSelect('音频编码', config.audio?.codec, AUDIO_CODEC_OPTIONS, value => updateAudio({ codec: value }))}
            <label className="ffmpeg-op-page__field">
              <span>视频码率</span>
              <input value={config.video?.bitrate || ''} onChange={event => updateVideo({ bitrate: event.target.value })} placeholder="2500k" />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>音频码率</span>
              <input value={config.audio?.bitrate || ''} onChange={event => updateAudio({ bitrate: event.target.value })} placeholder="128k" />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>分辨率</span>
              <input value={config.video?.resolution || ''} onChange={event => updateVideo({ resolution: event.target.value })} placeholder="1280:720" />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>帧率</span>
              <input value={config.video?.fps ?? ''} onChange={event => updateVideo({ fps: parseNumberInput(event.target.value) })} placeholder="30" />
            </label>
            {renderCodecSelect('Preset', config.video?.preset, PRESET_OPTIONS, value => updateVideo({ preset: value }))}
            <label className="ffmpeg-op-page__field">
              <span>CRF</span>
              <input value={config.video?.crf ?? ''} onChange={event => updateVideo({ crf: parseNumberInput(event.target.value) })} placeholder="23" />
            </label>
          </div>
        )
      case 'watermark':
        return (
          <div className="ffmpeg-op-page__grid">
            <label className="ffmpeg-op-page__field ffmpeg-op-page__field--wide">
              <span>水印图片</span>
              <div className="ffmpeg-op-page__input-row">
                <input value={overlayFilter.image} onChange={event => updateOverlay({ image: event.target.value })} placeholder="/path/to/watermark.png" />
                <button type="button" onClick={selectWatermarkImage}>选择</button>
              </div>
            </label>
            <label className="ffmpeg-op-page__field">
              <span>X</span>
              <input value={overlayFilter.x ?? ''} onChange={event => updateOverlay({ x: parseNumberInput(event.target.value) })} />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>Y</span>
              <input value={overlayFilter.y ?? ''} onChange={event => updateOverlay({ y: parseNumberInput(event.target.value) })} />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>缩放</span>
              <input value={overlayFilter.scale ?? ''} onChange={event => updateOverlay({ scale: parseNumberInput(event.target.value) })} placeholder="0.2" />
            </label>
            {renderCodecSelect('视频编码', config.video?.codec, VIDEO_CODEC_OPTIONS, value => updateVideo({ codec: value }))}
            {renderCodecSelect('音频编码', config.audio?.codec, AUDIO_CODEC_OPTIONS, value => updateAudio({ codec: value }))}
          </div>
        )
      case 'extractAudio':
        return (
          <div className="ffmpeg-op-page__grid">
            {renderCodecSelect('音频编码', config.audio?.codec, AUDIO_CODEC_OPTIONS, value => updateAudio({ codec: value }))}
            <label className="ffmpeg-op-page__field">
              <span>输出格式</span>
              <input value={config.output?.format || ''} onChange={event => updateOutput({ format: event.target.value })} placeholder="aac" />
            </label>
          </div>
        )
      case 'concat':
        return (
          <div className="ffmpeg-op-page__stack">
            <div className="ffmpeg-op-page__note">
              合并操作会根据选择的多个文件自动生成 concat demuxer 列表，并作为当前操作输入。
            </div>
            {concatInputs.length > 0 && (
              <div className="ffmpeg-op-page__file-list">
                {concatInputs.map(filePath => <span key={filePath}>{filePath}</span>)}
              </div>
            )}
          </div>
        )
      case 'custom':
        return (
          <label className="ffmpeg-op-page__field">
            <span>额外参数</span>
            <textarea value={(config.args || []).join(' ')} onChange={event => patchConfig({ args: splitArgs(event.target.value) })} placeholder="-c:v libopenh264 -c:a aac" />
          </label>
        )
      default:
        return null
    }
  }

  return (
    <div className="ffmpeg-op-page">
      <header className="ffmpeg-op-page__hero">
        <div>
          <div className="ffmpeg-op-page__eyebrow">单独操作页面</div>
          <h1>{spec.icon} {spec.title}</h1>
          <p>{spec.description}</p>
        </div>
        <Link className="ffmpeg-op-page__bpmn-link" to="/ffmpeg-bpmn">
          进入 FFmpeg BPMN
        </Link>
      </header>

      <main className="ffmpeg-op-page__layout">
        <section className="ffmpeg-op-page__card">
          <div className="ffmpeg-op-page__section-title">
            <h2>{FFMPEG_ACTION_LABELS[action]}配置</h2>
            <span>action: {action}</span>
          </div>

          <div className="ffmpeg-op-page__grid">
            <label className="ffmpeg-op-page__field">
              <span>输入来源</span>
              <select value={config.input?.source || 'input'} onChange={event => updateInput({ source: event.target.value })}>
                <option value="input">初始输入 input</option>
                <option value="prev">上一步输出 prev</option>
              </select>
            </label>
            <label className="ffmpeg-op-page__field">
              <span>输入路径</span>
              <div className="ffmpeg-op-page__input-row">
                <input value={config.input?.path || ''} onChange={event => updateInput({ path: event.target.value })} placeholder={DEFAULT_INPUT_PATH} />
                <button type="button" onClick={action === 'concat' ? selectConcatFiles : selectInputFile}>
                  {action === 'concat' ? '选择多个' : '选择'}
                </button>
              </div>
            </label>
            {action !== 'probe' && (
              <>
                <label className="ffmpeg-op-page__field">
                  <span>输出变量</span>
                  <input value={config.output?.var || ''} onChange={event => updateOutput({ var: event.target.value })} placeholder="output" />
                </label>
                <label className="ffmpeg-op-page__field">
                  <span>输出格式</span>
                  <input value={config.output?.format || ''} onChange={event => updateOutput({ format: event.target.value })} placeholder="mp4" />
                </label>
                <label className="ffmpeg-op-page__check">
                  <input type="checkbox" checked={config.output?.overwrite !== false} onChange={event => updateOutput({ overwrite: event.target.checked })} />
                  覆盖输出文件
                </label>
              </>
            )}
          </div>

          <div className="ffmpeg-op-page__divider" />
          {renderOperationFields()}
          <div className="ffmpeg-op-page__actions">
            <button type="button" onClick={runOperation} disabled={runState.status === 'running'}>
              {runState.status === 'running' ? '执行中...' : action === 'probe' ? '开始探测' : '执行操作'}
            </button>
            {runState.status === 'running' && action !== 'probe' && (
              <span>进度 {runState.progress ?? 0}%</span>
            )}
            {action === 'probe' && probeDisplayStatus === 'probing' && (
              <span className="ffmpeg-op-page__probe-hint">正在读取媒体流信息…</span>
            )}
          </div>

          {action === 'probe' && (
            <ProbeMediaInfoGrid status={probeDisplayStatus} info={probeMediaInfo} />
          )}
        </section>

        <aside className="ffmpeg-op-page__side">
          <section className="ffmpeg-op-page__card">
            <div className="ffmpeg-op-page__section-title">
              <h2>命令预览</h2>
            </div>
            <pre className="ffmpeg-op-page__code">{commandPreview}</pre>
          </section>

          <section className="ffmpeg-op-page__card">
            <div className="ffmpeg-op-page__section-title">
              <h2>执行结果</h2>
              <span>{runState.status}</span>
            </div>
            {runState.outputPath && (
              <p className="ffmpeg-op-page__result-path">输出文件: {runState.outputPath}</p>
            )}
            {runState.error && (
              <p className="ffmpeg-op-page__result-error">{runState.error}</p>
            )}
            {(runState.stdout || runState.stderr || probeResultJson) && (
              <pre className="ffmpeg-op-page__code">
                {action === 'probe' ? (probeResultJson || runState.stderr) : (runState.stdout || runState.stderr)}
              </pre>
            )}
          </section>

          <section className="ffmpeg-op-page__card">
            <div className="ffmpeg-op-page__section-title">
              <h2>BPMN 兼容配置</h2>
              <button type="button" onClick={copyConfigJson}>{copied ? '已复制' : '复制 JSON'}</button>
            </div>
            <p className="ffmpeg-op-page__compat">
              这里输出的 JSON 使用 `FfmpegJobConfig`，可直接作为 BPMN ServiceTask 的 `ffmpeg:Config json`。
            </p>
            <pre className="ffmpeg-op-page__code ffmpeg-op-page__code--json">{configJson}</pre>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default SingleFfmpegOperationPage
