import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FfmpegJobAction, FfmpegJobConfig, FfmpegJobFilter } from '../../services/ffmpeg'
import {
  AUDIO_CODEC_OPTIONS,
  FFMPEG_ACTION_LABELS,
  PRESET_OPTIONS,
  VIDEO_CODEC_OPTIONS,
  previewJobCommand,
  serializeFfmpegJobConfig
} from '../../services/ffmpeg'
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
    title: 'FFmpeg 裁剪',
    description: '按开始时间和持续时长截取音视频片段',
    path: '/ffmpeg-trim',
    icon: '✂️'
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

  const configJson = useMemo(() => serializeFfmpegJobConfig(config), [config])
  const overlayFilter = getOverlayFilter(config)

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
        const result = await ffmpeg.probe({ inputPath })
        setRunState({
          status: result.success ? 'success' : 'failed',
          progress: result.success ? 100 : 0,
          stdout: result.info ? JSON.stringify(result.info, null, 2) : undefined,
          stderr: result.info?.raw,
          error: result.error
        })
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
          <div className="ffmpeg-op-page__grid">
            <label className="ffmpeg-op-page__field">
              <span>开始时间</span>
              <input value={config.trim?.start || ''} onChange={event => patchConfig({ trim: { ...config.trim, start: event.target.value } })} placeholder="0 或 00:00:05" />
            </label>
            <label className="ffmpeg-op-page__field">
              <span>持续时长</span>
              <input value={config.trim?.duration || ''} onChange={event => patchConfig({ trim: { ...config.trim, duration: event.target.value } })} placeholder="10 或 00:00:10" />
            </label>
            <label className="ffmpeg-op-page__check">
              <input type="checkbox" checked={config.trim?.copyStream !== false} onChange={event => patchConfig({ trim: { ...config.trim, copyStream: event.target.checked } })} />
              复制码流
            </label>
            <label className="ffmpeg-op-page__check">
              <input type="checkbox" checked={config.trim?.precise === true} onChange={event => patchConfig({ trim: { ...config.trim, precise: event.target.checked } })} />
              精准裁剪
            </label>
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
            {runState.status === 'running' && (
              <span>进度 {runState.progress ?? 0}%</span>
            )}
          </div>
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
            {(runState.stdout || runState.stderr) && (
              <pre className="ffmpeg-op-page__code">{runState.stdout || runState.stderr}</pre>
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
