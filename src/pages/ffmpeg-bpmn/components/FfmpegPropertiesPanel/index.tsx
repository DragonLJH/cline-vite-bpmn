import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'

import { useFfmpegBpmnStore } from '../../../../stores/ffmpegBpmnStore'

import type { FfmpegJobAction, FfmpegJobConfig, FfmpegJobFilter, FfmpegDrawtextFilter, FfmpegOverlayFilter, BpmnElement } from '../../../../types/bpmn'

import {

  DEFAULT_FFMPEG_CONFIG,

  FFMPEG_OPERATION_LABELS,

  readFfmpegConfigFromElement,

  persistFfmpegConfigToModel

} from '../../../../services/ffmpeg/configCodec'

import { previewJobCommand } from '../../../../services/ffmpeg/jobCommandBuilder'
import { DEFAULT_FFMPEG_CONCAT_COPY, DEFAULT_FFMPEG_XFADE_AUDIO, DEFAULT_FFMPEG_XFADE_VIDEO } from '../../../../shared/ffmpeg/jobConfig'
import {
  canUseMergeAction,
  collectEntryInputTasks,
  collectUpstreamServiceTasks
} from '../../../../shared/ffmpeg/mergeInputs'
import { sanitizeVideoEncoding, supportsX264Preset } from '../../../../shared/ffmpeg/codecResolver'
import { XFADE_TRANSITION_OPTIONS } from '../../../../shared/ffmpeg/xfadeCommandBuilder'
import { parseWorkflowGraph } from '../../../../utils/bpmnParser'

import {

  AUDIO_CODEC_OPTIONS,

  PRESET_OPTIONS,

  VIDEO_CODEC_OPTIONS

} from '../../../../services/ffmpeg/types'

import { parseTimeToSeconds } from '../../../../services/ffmpeg/timeUtils'
import {
  findKeyframeIndexAtTime,
  resolveCropAtTime,
  sortCropKeyframes
} from '../../../../shared/ffmpeg/cropKeyframes'
import type { FfmpegJobCropKeyframe } from '../../../../types/bpmn'

import { toLocalMediaUrl } from '../../../../services/ffmpeg/coordinateUtils'

import Icon from '../../../../components/Icon'

import TrimTimeline from '../../../../components/ffmpeg/TrimTimeline'
import SeekTimeline from '../../../../components/ffmpeg/SeekTimeline'
import CropCanvas from '../../../../components/ffmpeg/CropCanvas'

import PreviewSourceBar from './preview/PreviewSourceBar'

import WatermarkCanvas from './preview/WatermarkCanvas'

import FilterTimeRange from './preview/FilterTimeRange'

import './index.scss'



const BASE_ACTIONS: FfmpegJobAction[] = [

  'trim',

  'crop',

  'transcode',

  'watermark',

  'extractAudio',

  'custom'

]



const INPUT_SOURCES = [

  { value: 'input', label: '初始输入 (input)' },

  { value: 'prev', label: '上一步输出 (prev)' }

]

function restoreCanvasSelection(elementId: string | null) {
  const modeler = useFfmpegBpmnStore.getState().modelerRef
  if (!modeler) return

  try {
    const selection = modeler.get('selection') as { select: (elements: unknown[]) => void }
    if (!elementId) {
      selection.select([])
      return
    }
    const elementRegistry = modeler.get('elementRegistry') as {
      get: (id: string) => unknown
    }
    const element = elementRegistry.get(elementId)
    if (element) selection.select([element])
  } catch (error) {
    console.warn('恢复画布选中失败:', error)
  }
}



const FfmpegPropertiesPanel: React.FC = () => {

  const {
    selectedElement,
    setHasUnsavedChanges,
    previewContext,
    refreshPreview,
    setActiveTab,
    bpmnXml,
    setActivePreviewTaskId,
    getPreviewSourceForTask
  } = useFfmpegBpmnStore()

  const [elementName, setElementName] = useState('')

  const [elementId, setElementId] = useState('')

  const [ffmpegConfig, setFfmpegConfig] = useState<FfmpegJobConfig>({ ...DEFAULT_FFMPEG_CONFIG })

  const [hasChanges, setHasChanges] = useState(false)
  const [commandPreview, setCommandPreview] = useState('')

  const [selectedFilterIndex, setSelectedFilterIndex] = useState<number | null>(null)

  const filterCardRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const loadedElementIdRef = useRef<string | null>(null)
  const prevSelectedElementRef = useRef<BpmnElement | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingElement, setPendingElement] = useState<BpmnElement | null>(null)
  const [pendingDeselect, setPendingDeselect] = useState(false)



  const isServiceTask = selectedElement?.type === 'bpmn:ServiceTask'

  const workflowGraph = useMemo(() => parseWorkflowGraph(bpmnXml), [bpmnXml])
  const mergeAllowed = useMemo(
    () => (elementId ? canUseMergeAction(elementId, workflowGraph) : false),
    [elementId, workflowGraph]
  )
  const availableActions = useMemo(
    () => (mergeAllowed ? [...BASE_ACTIONS, 'concat' as const] : BASE_ACTIONS),
    [mergeAllowed]
  )
  const upstreamBranchIds = useMemo(
    () => (elementId && workflowGraph ? collectUpstreamServiceTasks(elementId, workflowGraph) : []),
    [elementId, workflowGraph]
  )
  const entryTaskIds = useMemo(
    () => new Set((workflowGraph ? collectEntryInputTasks(workflowGraph) : []).map(task => task.id)),
    [workflowGraph]
  )
  const previewSource = getPreviewSourceForTask(
    selectedElement?.id && entryTaskIds.has(selectedElement.id) ? selectedElement.id : previewContext.activePreviewTaskId
  )
  const activeEntryTaskId = selectedElement?.id && entryTaskIds.has(selectedElement.id)
    ? selectedElement.id
    : previewContext.activePreviewTaskId
  const activeEntryState = activeEntryTaskId ? previewContext.entryInputs[activeEntryTaskId] : null
  const previewAvailable = ffmpegConfig.action !== 'concat'
    && ffmpegConfig.input?.source !== 'prev'
    && ffmpegConfig.input?.source !== 'merge'
    && (entryTaskIds.has(selectedElement?.id || '') || ffmpegConfig.input?.source === 'input')

  const mediaDuration = previewSource.mediaInfo?.durationSeconds
    || parseTimeToSeconds(previewSource.mediaInfo?.duration)
    || 60

  const filterTimeMax = ffmpegConfig.action === 'trim'
    ? parseTimeToSeconds(ffmpegConfig.trim?.duration)
    : mediaDuration

  useEffect(() => {
    if (!isServiceTask) {
      setCommandPreview('')
      return
    }

    let cancelled = false
    const localPreview = previewJobCommand(ffmpegConfig)
    setCommandPreview(localPreview)

    const loadPreview = async () => {
      const result = await window.electronAPI?.ffmpeg.previewJobCommand?.({
        config: ffmpegConfig,
        inputPath: previewSource.inputPath || undefined,
        overlayImages: (ffmpegConfig.filters || [])
          .filter((filter): filter is Extract<FfmpegJobFilter, { type: 'overlay' }> => filter.type === 'overlay')
          .map(filter => filter.image)
      })
      if (!cancelled && result?.success && result.command) {
        setCommandPreview(result.command)
      }
    }

    loadPreview()
    return () => { cancelled = true }
  }, [ffmpegConfig, isServiceTask, previewSource.inputPath])

  useEffect(() => {
    if (!selectedElement?.id || !entryTaskIds.has(selectedElement.id)) return
    setActivePreviewTaskId(selectedElement.id)
  }, [selectedElement?.id, entryTaskIds, setActivePreviewTaskId])

  useEffect(() => {
    if (ffmpegConfig.action === 'concat' && !mergeAllowed) {
      setFfmpegConfig(prev => ({
        ...prev,
        action: 'transcode',
        concat: undefined,
        video: { codec: 'libopenh264', preset: 'medium' },
        audio: { codec: 'aac' }
      }))
      setHasChanges(true)
    }
  }, [ffmpegConfig.action, mergeAllowed])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedFilterIndex == null || !isServiceTask) return
      const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      if (!arrows.includes(e.key)) return

      e.preventDefault()
      const filter = ffmpegConfig.filters?.[selectedFilterIndex]
      if (!filter) return

      const step = e.shiftKey ? 5 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      updateFilter(selectedFilterIndex, {
        x: (filter.x ?? 10) + dx,
        y: (filter.y ?? 10) + dy
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFilterIndex, ffmpegConfig.filters, isServiceTask])

  useEffect(() => {
    if (selectedFilterIndex == null) return
    const el = filterCardRefs.current[selectedFilterIndex]
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedFilterIndex])

  useEffect(() => {
    if (ffmpegConfig.action !== 'crop' || !previewContext.mediaInfo || ffmpegConfig.crop) return
    const width = previewContext.mediaInfo.width || 1920
    const height = previewContext.mediaInfo.height || 1080
    setFfmpegConfig(prev => ({
      ...prev,
      crop: { x: 0, y: 0, width, height },
      cropAdvanced: {
        ...prev.cropAdvanced,
        durationSeconds: previewContext.mediaInfo?.durationSeconds
          || parseTimeToSeconds(previewContext.mediaInfo?.duration)
      }
    }))
  }, [ffmpegConfig.action, ffmpegConfig.crop, previewContext.mediaInfo])



  const loadElementData = useCallback((element: typeof selectedElement) => {

    if (!element) return

    setElementName(element.name || '')

    setElementId(element.id)

    if (element.type === 'bpmn:ServiceTask') {

      const pending = useFfmpegBpmnStore.getState().pendingFfmpegConfigs[element.id]
      const modeler = useFfmpegBpmnStore.getState().modelerRef

      const loadedConfig = pending || readFfmpegConfigFromElement(modeler, element.id, element.businessObject)
      setFfmpegConfig(
        loadedConfig.action === 'probe'
          ? { ...DEFAULT_FFMPEG_CONFIG, input: { source: 'input' } }
          : loadedConfig
      )

    } else {

      setFfmpegConfig({ ...DEFAULT_FFMPEG_CONFIG })

    }

    setHasChanges(false)

  }, [])



  useEffect(() => {

    if (selectedElement) {

      const prevElement = prevSelectedElementRef.current

      const isElementSwitch = prevElement && prevElement.id !== selectedElement.id

      if (hasChanges && isElementSwitch) {

        setPendingElement(selectedElement)

        setPendingDeselect(false)

        setShowConfirmDialog(true)

        restoreCanvasSelection(prevElement.id)

        useFfmpegBpmnStore.getState().setSelectedElement(prevElement)

        return

      }

      if (loadedElementIdRef.current !== selectedElement.id) {

        loadedElementIdRef.current = selectedElement.id

        loadElementData(selectedElement)

      }

      prevSelectedElementRef.current = selectedElement

      return

    }

    const prevElement = prevSelectedElementRef.current

    if (hasChanges && prevElement) {

      setPendingElement(null)

      setPendingDeselect(true)

      setShowConfirmDialog(true)

      restoreCanvasSelection(prevElement.id)

      useFfmpegBpmnStore.getState().setSelectedElement(prevElement)

      return

    }

    loadedElementIdRef.current = null

    prevSelectedElementRef.current = null

  }, [selectedElement, loadElementData])



  useEffect(() => {

    if (!isServiceTask || !selectedElement || !hasChanges) return

    useFfmpegBpmnStore.getState().setPendingFfmpegConfig(selectedElement.id, ffmpegConfig)

  }, [ffmpegConfig, isServiceTask, selectedElement, hasChanges])



  const updateConfig = (patch: Partial<FfmpegJobConfig>) => {

    setFfmpegConfig(prev => ({ ...prev, ...patch }))

    setHasChanges(true)

  }



  const handleActionChange = (action: FfmpegJobAction) => {
    setFfmpegConfig(prev => {
      const next: FfmpegJobConfig = { ...prev, action }

      if (action === 'watermark') {
        next.filters = prev.filters?.length ? [...prev.filters] : []
        delete next.video
        delete next.audio
      } else if (action === 'crop') {
        delete next.filters
        delete next.trim
        next.crop = prev.crop || { x: 0, y: 0, width: 1920, height: 1080 }
        next.cropAdvanced = prev.cropAdvanced || { mode: 'static', keyframes: [], interp: 'step' }
        next.video = { codec: 'libopenh264' }
        next.audio = { codec: 'copy' }
      } else if (action === 'transcode') {
        delete next.filters
        next.video = { codec: 'libopenh264', preset: 'medium' }
        next.audio = { codec: 'aac' }
      } else if (action === 'concat') {
        delete next.filters
        delete next.trim
        delete next.crop
        delete next.cropAdvanced
        next.input = { source: 'merge' }
        next.concat = { ...DEFAULT_FFMPEG_CONCAT_COPY }
        delete next.video
        delete next.audio
      }

      return next
    })
    setHasChanges(true)
  }



  const updateInput = (patch: Partial<FfmpegJobConfig['input']>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      input: { ...prev.input, ...patch }

    }))

    setHasChanges(true)

  }



  const updateOutput = (patch: Partial<FfmpegJobConfig['output']>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      output: { ...prev.output, ...patch }

    }))

    setHasChanges(true)

  }



  const updateVideo = (patch: Partial<NonNullable<FfmpegJobConfig['video']>>) => {
    setFfmpegConfig(prev => {
      const merged = { ...prev.video, ...patch }
      const video = prev.action === 'concat' && prev.concat?.mode === 'xfade'
        ? sanitizeVideoEncoding(merged)
        : merged
      return { ...prev, video }
    })
    setHasChanges(true)
  }



  const updateAudio = (patch: Partial<NonNullable<FfmpegJobConfig['audio']>>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      audio: { ...prev.audio, ...patch }

    }))

    setHasChanges(true)

  }

  const updateConcat = (patch: Partial<NonNullable<FfmpegJobConfig['concat']>>) => {
    setFfmpegConfig(prev => {
      const nextMode = patch.mode ?? prev.concat?.mode ?? 'copy'
      const next: FfmpegJobConfig = {
        ...prev,
        concat: { ...prev.concat, ...patch, mode: nextMode }
      }
      if (nextMode === 'xfade') {
        next.video = sanitizeVideoEncoding(next.video || { ...DEFAULT_FFMPEG_XFADE_VIDEO })
        next.audio = next.audio || { ...DEFAULT_FFMPEG_XFADE_AUDIO }
      } else {
        delete next.video
        delete next.audio
      }
      return next
    })
    setHasChanges(true)
  }



  const updateTrim = (patch: Partial<NonNullable<FfmpegJobConfig['trim']>>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      trim: { ...prev.trim, ...patch }

    }))

    setHasChanges(true)

  }



  const updateCrop = (patch: Partial<NonNullable<FfmpegJobConfig['crop']>>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      crop: { ...(prev.crop || { x: 0, y: 0, width: 1920, height: 1080 }), ...patch }

    }))

    setHasChanges(true)

  }



  const updateCropAdvanced = (patch: Partial<NonNullable<FfmpegJobConfig['cropAdvanced']>>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      cropAdvanced: { ...prev.cropAdvanced, ...patch }

    }))

    setHasChanges(true)

  }



  const updateGlobal = (patch: Partial<NonNullable<FfmpegJobConfig['global']>>) => {

    setFfmpegConfig(prev => ({

      ...prev,

      global: { ...prev.global, ...patch }

    }))

    setHasChanges(true)

  }



  const updateFilter = (index: number, patch: Partial<FfmpegDrawtextFilter | FfmpegOverlayFilter>) => {

    setFfmpegConfig(prev => {

      const filters = [...(prev.filters || [])]

      const current = { ...filters[index], ...patch } as FfmpegDrawtextFilter | FfmpegOverlayFilter

      if ('start' in patch && patch.start === undefined) delete (current as { start?: string }).start

      if ('end' in patch && patch.end === undefined) delete (current as { end?: string }).end

      filters[index] = current

      return { ...prev, filters }

    })

    setHasChanges(true)

  }



  const addDrawtextFilter = () => {

    setFfmpegConfig(prev => ({

      ...prev,

      filters: [

        ...(prev.filters || []),

        { type: 'drawtext', text: '测试水印', x: 10, y: 10 }

      ]

    }))

    setHasChanges(true)

  }



  const addOverlayFilter = () => {

    setFfmpegConfig(prev => ({

      ...prev,

      filters: [

        ...(prev.filters || []),

        { type: 'overlay', image: '/path/to/watermark.png', scale: 0.2 }

      ]

    }))

    setHasChanges(true)

  }



  const duplicateFilter = (index: number) => {

    const filter = ffmpegConfig.filters?.[index]

    if (!filter) return

    const clone = {

      ...filter,

      x: (filter.x ?? 10) + 20,

      y: (filter.y ?? 10) + 20

    }

    setFfmpegConfig(prev => ({

      ...prev,

      filters: [...(prev.filters || []), clone]

    }))

    setHasChanges(true)

    setSelectedFilterIndex((ffmpegConfig.filters?.length || 0))

  }



  const handleSelectWatermarkImage = async (index: number) => {

    if (!window.electronAPI) return

    const paths = await window.electronAPI.openFileDialog({

      title: '选择水印图片',

      filters: [

        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }

      ],

      properties: ['openFile']

    })

    if (paths && paths[0]) {

      updateFilter(index, { image: paths[0] })

    }

  }



  const handleSeekPreview = useCallback((seconds: number) => {

    if (previewAvailable) {

      refreshPreview(seconds)

    }

  }, [previewAvailable, refreshPreview])



  const removeFilter = (index: number) => {

    setFfmpegConfig(prev => ({

      ...prev,

      filters: (prev.filters || []).filter((_, i) => i !== index)

    }))

    setHasChanges(true)

    if (selectedFilterIndex === index) setSelectedFilterIndex(null)

    else if (selectedFilterIndex != null && selectedFilterIndex > index) {

      setSelectedFilterIndex(selectedFilterIndex - 1)

    }

  }



  const handleSave = async (): Promise<boolean> => {

    const modeler = useFfmpegBpmnStore.getState().modelerRef

    if (!modeler || !selectedElement) return false



    try {

      const elementRegistry = modeler.get('elementRegistry')

      const modeling = modeler.get('modeling')

      const element = elementRegistry.get(selectedElement.id)

      if (!element) return false



      const properties: Record<string, unknown> = {}

      if (elementName !== (selectedElement.name || '')) {

        properties.name = elementName

      }

      if (elementId !== selectedElement.id) {

        properties.id = elementId

      }



      if (Object.keys(properties).length > 0) {

        modeling.updateProperties(element, properties)

      }



      if (isServiceTask) {

        const targetId = elementId || selectedElement.id

        if (!persistFfmpegConfigToModel(modeler, targetId, ffmpegConfig)) {

          console.error('保存 FFmpeg 配置到节点失败')

          return false

        }

      }



      setHasUnsavedChanges(true)

      setHasChanges(false)

      useFfmpegBpmnStore.getState().clearPendingFfmpegConfig(selectedElement.id)

      if (elementId && elementId !== selectedElement.id) {

        useFfmpegBpmnStore.getState().clearPendingFfmpegConfig(elementId)

      }

      try {

        const { xml } = await modeler.saveXML({ format: true })

        if (xml) {

          useFfmpegBpmnStore.getState().setBpmnXmlFromModeler(xml)

        }

      } catch (error) {

        console.warn('保存后同步 BPMN XML 失败:', error)

      }



      const updated = elementRegistry.get(elementId || selectedElement.id)

      if (updated) {

        const savedConfig = readFfmpegConfigFromElement(

          modeler,

          updated.id,

          updated.businessObject

        )

        setFfmpegConfig(savedConfig)

        useFfmpegBpmnStore.getState().setSelectedElement({

          id: updated.id,

          type: updated.type as typeof selectedElement.type,

          name: updated.businessObject?.name,

          businessObject: updated.businessObject

        })

      }

      return true

    } catch (error) {

      console.error('保存 FFmpeg 配置失败:', error)

      return false

    }

  }



  const closeConfirmDialog = () => {

    setShowConfirmDialog(false)

    setPendingElement(null)

    setPendingDeselect(false)

  }



  const applyPendingSelection = (target: BpmnElement | null) => {

    if (target) {

      loadedElementIdRef.current = target.id

      loadElementData(target)

      prevSelectedElementRef.current = target

      useFfmpegBpmnStore.getState().setSelectedElement(target)

      restoreCanvasSelection(target.id)

      return

    }

    loadedElementIdRef.current = null

    prevSelectedElementRef.current = null

    useFfmpegBpmnStore.getState().setSelectedElement(null)

    restoreCanvasSelection(null)

  }



  const handleConfirmCancel = () => {

    closeConfirmDialog()

  }



  const handleConfirmDiscard = () => {

    const prevId = prevSelectedElementRef.current?.id

    if (prevId) {

      useFfmpegBpmnStore.getState().clearPendingFfmpegConfig(prevId)

    }

    setHasChanges(false)

    if (pendingDeselect) {

      applyPendingSelection(null)

    } else if (pendingElement) {

      applyPendingSelection(pendingElement)

    }

    closeConfirmDialog()

  }



  const handleConfirmSave = async () => {

    const saved = await handleSave()

    if (!saved) return

    if (pendingDeselect) {

      applyPendingSelection(null)

    } else if (pendingElement) {

      applyPendingSelection(pendingElement)

    }

    closeConfirmDialog()

  }



  const renderActionParams = () => {

    switch (ffmpegConfig.action) {

      case 'trim':

        return (

          <>

            <TrimTimeline

              durationSeconds={mediaDuration}

              start={String(ffmpegConfig.trim?.start ?? '0')}

              duration={String(ffmpegConfig.trim?.duration ?? '10')}

              onChange={patch => updateTrim(patch)}

              onSeekPreview={previewAvailable && previewContext.mediaInfo ? handleSeekPreview : undefined}

              durationEstimated={!previewContext.mediaInfo}

            />

            {!previewContext.mediaInfo && previewAvailable && !previewContext.inputPath && (

              <p className="ffmpeg-props__hint">请先在执行面板选择视频，以获取真实时长并启用预览截帧。</p>

            )}

            {!previewContext.mediaInfo && previewContext.inputPath && (

              <p className="ffmpeg-props__hint">正在探测视频时长…若失败则暂用默认 60 秒刻度。</p>

            )}

            <label className="ffmpeg-props__field">

              <span>开始时间</span>

              <input

                value={String(ffmpegConfig.trim?.start ?? '0')}

                onChange={e => updateTrim({ start: e.target.value })}

              />

            </label>

            <label className="ffmpeg-props__field">

              <span>时长</span>

              <input

                value={String(ffmpegConfig.trim?.duration ?? '10')}

                onChange={e => updateTrim({ duration: e.target.value })}

              />

            </label>

            <label className="ffmpeg-props__field ffmpeg-props__field--row">

              <input

                type="checkbox"

                checked={ffmpegConfig.trim?.copyStream !== false}

                onChange={e => updateTrim({ copyStream: e.target.checked })}

              />

              <span>流复制 (copy)</span>

            </label>

            {ffmpegConfig.trim?.copyStream !== false && (

              <p className="ffmpeg-props__hint">流复制模式下裁剪点可能对齐到关键帧，画面略有偏差。</p>

            )}

          </>

        )

      case 'crop': {
        const cropRealW = previewContext.mediaInfo?.width || 1920
        const cropRealH = previewContext.mediaInfo?.height || 1080
        const cropRegion = ffmpegConfig.crop || { x: 0, y: 0, width: cropRealW, height: cropRealH }
        const cropVideoSrc = previewContext.inputPath ? toLocalMediaUrl(previewContext.inputPath) : null
        const cropPreviewImage = previewContext.previewMode === 'snapshot'
          ? previewContext.previewFrameDataUrl
          : null
        const previewTime = previewContext.previewFrameTime ?? 0
        const isKeyframeMode = ffmpegConfig.cropAdvanced?.mode === 'keyframes'
        const cropKeyframeTimes = sortCropKeyframes(ffmpegConfig.cropAdvanced?.keyframes || []).map(item => item.time)
        const cropDisplayRegion = isKeyframeMode
          ? resolveCropAtTime(ffmpegConfig.cropAdvanced?.keyframes, previewTime, cropRegion, mediaDuration)
          : cropRegion

        const handleCropRegionChange = (patch: Partial<typeof cropRegion>) => {
          if (isKeyframeMode) {
            setFfmpegConfig(prev => {
              const keyframes = [...(prev.cropAdvanced?.keyframes || [])]
              const base = resolveCropAtTime(keyframes, previewTime, prev.crop || cropRegion, mediaDuration)
              const nextKeyframe: FfmpegJobCropKeyframe = { time: previewTime, ...base, ...patch }
              const index = findKeyframeIndexAtTime(keyframes, previewTime)
              if (index >= 0) keyframes[index] = nextKeyframe
              else keyframes.push(nextKeyframe)
              return {
                ...prev,
                cropAdvanced: {
                  ...prev.cropAdvanced,
                  mode: 'keyframes',
                  interp: 'step',
                  durationSeconds: mediaDuration,
                  keyframes: sortCropKeyframes(keyframes)
                }
              }
            })
            setHasChanges(true)
            return
          }
          updateCrop(patch)
        }

        return (
          <>
            {!previewContext.inputPath && previewAvailable && (
              <p className="ffmpeg-props__hint">请先在执行面板选择视频，以获取分辨率并启用画面裁剪预览。</p>
            )}
            {previewContext.inputPath && !previewContext.mediaInfo && (
              <p className="ffmpeg-props__hint">正在探测视频分辨率…若失败则暂用默认 1920×1080 刻度。</p>
            )}
            {previewContext.inputPath && (
              <label className="ffmpeg-props__field ffmpeg-props__field--row">
                <input
                  type="checkbox"
                  checked={isKeyframeMode}
                  onChange={e => {
                    if (e.target.checked) {
                      updateCropAdvanced({
                        mode: 'keyframes',
                        interp: 'step',
                        durationSeconds: mediaDuration,
                        keyframes: [{ time: 0, ...cropRegion }]
                      })
                    } else {
                      updateCropAdvanced({ mode: 'static', keyframes: [] })
                    }
                  }}
                />
                <span>高级模式（关键帧分段裁剪）</span>
              </label>
            )}
            {previewContext.inputPath && isKeyframeMode && (
              <div className="ffmpeg-props__crop-keyframe-actions">
                <button
                  type="button"
                  onClick={() => {
                    const keyframes = [...(ffmpegConfig.cropAdvanced?.keyframes || [])]
                    if (findKeyframeIndexAtTime(keyframes, previewTime) >= 0) return
                    keyframes.push({ time: previewTime, ...cropDisplayRegion })
                    updateCropAdvanced({
                      mode: 'keyframes',
                      interp: 'step',
                      durationSeconds: mediaDuration,
                      keyframes: sortCropKeyframes(keyframes)
                    })
                  }}
                >
                  添加关键帧
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateCropAdvanced({
                      keyframes: (ffmpegConfig.cropAdvanced?.keyframes || []).filter(
                        item => Math.abs(item.time - previewTime) > 0.05
                      )
                    })
                  }}
                >
                  删除当前关键帧
                </button>
                <span>{cropKeyframeTimes.length} 个关键帧</span>
              </div>
            )}
            {previewContext.inputPath && (
              <SeekTimeline
                durationSeconds={mediaDuration}
                currentSeconds={previewTime}
                onSeek={seconds => {
                  if (previewAvailable) void refreshPreview(seconds)
                }}
                keyframeTimes={isKeyframeMode ? cropKeyframeTimes : undefined}
                onKeyframeSelect={seconds => {
                  if (previewAvailable) void refreshPreview(seconds)
                }}
                disabled={!previewContext.inputPath || !previewAvailable}
                durationEstimated={!previewContext.mediaInfo}
                loading={previewContext.previewLoading}
              />
            )}
            {(cropPreviewImage || cropVideoSrc) && (
              <CropCanvas
                videoSrc={cropPreviewImage ? null : cropVideoSrc}
                previewImageUrl={cropPreviewImage}
                realW={cropRealW}
                realH={cropRealH}
                crop={cropDisplayRegion}
                onChange={handleCropRegionChange}
                disabled={!previewContext.inputPath || !previewAvailable}
                resolutionEstimated={!previewContext.mediaInfo}
                previewLoading={previewContext.previewLoading}
              />
            )}
            <label className="ffmpeg-props__field">
              <span>视频编码</span>
              <select
                value={String(ffmpegConfig.video?.codec ?? 'libopenh264')}
                onChange={e => updateVideo({ codec: e.target.value })}
              >
                {VIDEO_CODEC_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="ffmpeg-props__field">
              <span>音频编码</span>
              <select
                value={String(ffmpegConfig.audio?.codec ?? 'copy')}
                onChange={e => updateAudio({ codec: e.target.value })}
              >
                {AUDIO_CODEC_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <p className="ffmpeg-props__hint">
              {isKeyframeMode
                ? '高级模式：相邻关键帧之间按阶跃方式应用不同裁剪区域；时间轴用于预览与打点。'
                : '简单模式：全片使用同一裁剪区域；时间轴仅用于选择预览帧。'}
              执行时需重编码，不支持流复制。
            </p>
          </>
        )
      }

      case 'transcode':

        return (

          <>

            <label className="ffmpeg-props__field">

              <span>视频编码</span>

              <select

                value={String(ffmpegConfig.video?.codec ?? 'libopenh264')}

                onChange={e => updateVideo({ codec: e.target.value })}

              >

                {VIDEO_CODEC_OPTIONS.map(opt => (

                  <option key={opt.value} value={opt.value}>{opt.label}</option>

                ))}

              </select>

            </label>

            <label className="ffmpeg-props__field">

              <span>视频码率</span>

              <input

                value={String(ffmpegConfig.video?.bitrate ?? '')}

                onChange={e => updateVideo({ bitrate: e.target.value })}

                placeholder="1200k"

              />

            </label>

            <label className="ffmpeg-props__field">

              <span>音频编码</span>

              <select

                value={String(ffmpegConfig.audio?.codec ?? 'aac')}

                onChange={e => updateAudio({ codec: e.target.value })}

              >

                {AUDIO_CODEC_OPTIONS.map(opt => (

                  <option key={opt.value} value={opt.value}>{opt.label}</option>

                ))}

              </select>

            </label>

            <label className="ffmpeg-props__field">

              <span>预设</span>

              <select

                value={String(ffmpegConfig.video?.preset ?? 'medium')}

                onChange={e => updateVideo({ preset: e.target.value })}

              >

                {PRESET_OPTIONS.map(opt => (

                  <option key={opt.value} value={opt.value}>{opt.label}</option>

                ))}

              </select>

            </label>

          </>

        )

      case 'watermark':

        return (

          <p className="ffmpeg-props__hint">

            水印操作仅处理画面叠加，视频将重新编码，音频默认流复制 (copy)。

          </p>

        )

      case 'extractAudio':

        return (

          <label className="ffmpeg-props__field">

            <span>音频编码</span>

            <select

              value={String(ffmpegConfig.audio?.codec ?? 'copy')}

              onChange={e => updateAudio({ codec: e.target.value })}

            >

              {AUDIO_CODEC_OPTIONS.map(opt => (

                <option key={opt.value} value={opt.value}>{opt.label}</option>

              ))}

            </select>

          </label>

        )

      case 'concat':
        return (
          <>
            {!mergeAllowed && (
              <p className="ffmpeg-props__hint">
                合并操作需要先连接 ParallelGateway（Join），且上游至少 2 个 ServiceTask 分支。
              </p>
            )}
            <label className="ffmpeg-props__field">
              <span>合并模式</span>
              <select
                value={ffmpegConfig.concat?.mode || 'copy'}
                onChange={e => updateConcat({ mode: e.target.value as 'copy' | 'xfade' })}
              >
                <option value="copy">直接拼接 (copy)</option>
                <option value="xfade">交叉淡化 (重编码)</option>
              </select>
            </label>
            {upstreamBranchIds.length > 0 && (
              <div className="ffmpeg-props__field">
                <span>上游分支（自动识别）</span>
                <ul className="ffmpeg-props__branch-list">
                  {upstreamBranchIds.map(branchId => {
                    const branchTask = workflowGraph?.tasks.find(task => task.id === branchId)
                    return (
                      <li key={branchId}>{branchTask?.name || branchId}</li>
                    )
                  })}
                </ul>
              </div>
            )}
            {ffmpegConfig.concat?.mode === 'xfade' && (
              <>
                <label className="ffmpeg-props__field">
                  <span>转场效果</span>
                  <select
                    value={ffmpegConfig.concat?.transition || 'fade'}
                    onChange={e => updateConcat({ transition: e.target.value })}
                  >
                    {XFADE_TRANSITION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="ffmpeg-props__field">
                  <span>转场时长 (秒)</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    max={30}
                    value={ffmpegConfig.concat?.duration ?? 0.5}
                    onChange={e => updateConcat({ duration: Number(e.target.value) || 0.5 })}
                  />
                </label>
                <label className="ffmpeg-props__field">
                  <span>归一化帧率</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={ffmpegConfig.concat?.fps ?? 30}
                    onChange={e => updateConcat({ fps: Number(e.target.value) || 30 })}
                  />
                </label>
                <label className="ffmpeg-props__field">
                  <span>视频编码</span>
                  <select
                    value={String(ffmpegConfig.video?.codec ?? 'libopenh264')}
                    onChange={e => updateVideo({ codec: e.target.value })}
                  >
                    {VIDEO_CODEC_OPTIONS.filter(opt => opt.value !== 'copy').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {supportsX264Preset(ffmpegConfig.video?.codec) ? (
                  <>
                    <label className="ffmpeg-props__field">
                      <span>CRF</span>
                      <input
                        type="number"
                        min={0}
                        max={51}
                        value={ffmpegConfig.video?.crf ?? 23}
                        onChange={e => updateVideo({ crf: Number(e.target.value) })}
                      />
                    </label>
                    <label className="ffmpeg-props__field">
                      <span>预设</span>
                      <select
                        value={String(ffmpegConfig.video?.preset ?? 'medium')}
                        onChange={e => updateVideo({ preset: e.target.value })}
                      >
                        {PRESET_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="ffmpeg-props__field">
                    <span>视频码率</span>
                    <input
                      value={ffmpegConfig.video?.bitrate ?? '1200k'}
                      onChange={e => updateVideo({ bitrate: e.target.value })}
                      placeholder="1200k"
                    />
                  </label>
                )}
                <label className="ffmpeg-props__field">
                  <span>音频编码</span>
                  <select
                    value={String(ffmpegConfig.audio?.codec ?? 'aac')}
                    onChange={e => updateAudio({ codec: e.target.value })}
                  >
                    {AUDIO_CODEC_OPTIONS.filter(opt => opt.value !== 'copy').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="ffmpeg-props__field">
                  <span>音频码率</span>
                  <input
                    value={ffmpegConfig.audio?.bitrate ?? '128k'}
                    onChange={e => updateAudio({ bitrate: e.target.value })}
                    placeholder="128k"
                  />
                </label>
                <p className="ffmpeg-props__hint">
                  交叉淡化会重编码输出。内置 FFmpeg 使用 libopenh264，请配置视频码率（非 CRF）。
                </p>
              </>
            )}
            {ffmpegConfig.concat?.mode !== 'xfade' && (
              <p className="ffmpeg-props__hint">
                copy 模式要求各分支编码/分辨率/帧率一致，不一致时将报错。
              </p>
            )}
          </>
        )

      case 'custom':

        return (

          <label className="ffmpeg-props__field">

            <span>额外参数</span>

            <input

              value={Array.isArray(ffmpegConfig.args) ? ffmpegConfig.args.join(' ') : ''}

              onChange={e => updateConfig({ args: e.target.value.split(/\s+/).filter(Boolean) })}

              placeholder="-c:v libx264 -crf 23"

            />

          </label>

        )

      default:

        return null

    }

  }



  const renderFilters = () => {

    if (ffmpegConfig.action !== 'watermark') return null

    const filters = ffmpegConfig.filters || []

    const canPreview = previewAvailable && previewContext.mediaInfo

    const previewImageUrl = previewContext.previewMode === 'snapshot'
      ? previewContext.previewFrameDataUrl
      : null

    const videoSrc = !previewImageUrl && previewContext.inputPath
      ? toLocalMediaUrl(previewContext.inputPath)
      : null



    return (

      <div className="ffmpeg-props__subsection">

        <div className="ffmpeg-props__subsection-header">

          <span>水印配置</span>

          <div className="ffmpeg-props__inline-actions">

            <button type="button" onClick={addDrawtextFilter}>+ 文字</button>

            <button type="button" onClick={addOverlayFilter}>+ 图片</button>

          </div>

        </div>

        {canPreview && filters.length > 0 && previewContext.mediaInfo && (

          <WatermarkCanvas

            mediaInfo={previewContext.mediaInfo}

            previewImageUrl={previewImageUrl}

            videoSrc={videoSrc}

            filters={filters}

            selectedIndex={selectedFilterIndex}

            trimStartSeconds={parseTimeToSeconds(ffmpegConfig.trim?.start)}

            onSelect={setSelectedFilterIndex}

            onMove={(index, x, y) => updateFilter(index, { x, y })}

          />

        )}

        {filters.length === 0 && (

          <p className="ffmpeg-props__hint">可添加 drawtext 文字水印或 overlay 图片水印</p>

        )}

        {filters.map((filter, index) => (

          <div
            key={index}
            ref={el => { filterCardRefs.current[index] = el }}
            className={`ffmpeg-props__filter-card ${selectedFilterIndex === index ? 'ffmpeg-props__filter-card--selected' : ''}`}
            onClick={() => setSelectedFilterIndex(index)}
          >

            <div className="ffmpeg-props__filter-header">

              <span>{filter.type === 'drawtext' ? '文字水印' : '图片水印'}</span>

              <div className="ffmpeg-props__inline-actions">

                <button type="button" onClick={e => { e.stopPropagation(); duplicateFilter(index) }}>复制</button>

                <button type="button" onClick={e => { e.stopPropagation(); removeFilter(index) }}>删除</button>

              </div>

            </div>

            {filter.type === 'drawtext' ? (

              <>

                <label className="ffmpeg-props__field">

                  <span>文字</span>

                  <input

                    value={filter.text}

                    onChange={e => updateFilter(index, { text: e.target.value })}

                  />

                </label>

                <label className="ffmpeg-props__field">

                  <span>字号</span>

                  <input

                    type="number"

                    value={filter.fontSize ?? 24}

                    onChange={e => updateFilter(index, { fontSize: Number(e.target.value) })}

                  />

                </label>

                <label className="ffmpeg-props__field">

                  <span>X / Y</span>

                  <div className="ffmpeg-props__inline-inputs">

                    <input

                      type="number"

                      value={filter.x ?? 10}

                      onChange={e => updateFilter(index, { x: Number(e.target.value) })}

                    />

                    <input

                      type="number"

                      value={filter.y ?? 10}

                      onChange={e => updateFilter(index, { y: Number(e.target.value) })}

                    />

                  </div>

                </label>

              </>

            ) : (

              <>

                <label className="ffmpeg-props__field">

                  <span>图片路径</span>

                  <div className="ffmpeg-props__inline-inputs">

                    <input

                      value={filter.image}

                      onChange={e => updateFilter(index, { image: e.target.value })}

                      placeholder="绝对路径或变量名"

                    />

                    <button type="button" onClick={e => { e.stopPropagation(); handleSelectWatermarkImage(index) }}>选择</button>

                  </div>

                </label>

                <label className="ffmpeg-props__field">

                  <span>缩放比例</span>

                  <input

                    type="number"

                    step="0.05"

                    min="0.05"

                    max="1"

                    value={filter.scale ?? 0.2}

                    onChange={e => updateFilter(index, { scale: parseFloat(e.target.value) })}

                  />

                </label>

                <label className="ffmpeg-props__field">

                  <span>X / Y</span>

                  <div className="ffmpeg-props__inline-inputs">

                    <input

                      type="number"

                      value={filter.x ?? 10}

                      onChange={e => updateFilter(index, { x: Number(e.target.value) })}

                    />

                    <input

                      type="number"

                      value={filter.y ?? 10}

                      onChange={e => updateFilter(index, { y: Number(e.target.value) })}

                    />

                  </div>

                </label>

              </>

            )}

            <FilterTimeRange

              maxSeconds={filterTimeMax}

              start={filter.start}

              end={filter.end}

              enabled={filter.start != null && filter.end != null}

              onToggle={enabled => {

                if (enabled) {

                  updateFilter(index, { start: '0', end: String(filterTimeMax) })

                } else {

                  updateFilter(index, { start: undefined, end: undefined })

                }

              }}

              onChange={patch => updateFilter(index, patch)}

              onSeekPreview={previewAvailable && previewContext.mediaInfo ? handleSeekPreview : undefined}

              disabled={false}

            />

          </div>

        ))}

        {selectedFilterIndex != null && (

          <p className="ffmpeg-props__hint">方向键微调位置，Shift+方向键步进 5px</p>

        )}

      </div>

    )

  }



  if (!selectedElement) {

    return (

      <div className="ffmpeg-props">

        <div className="ffmpeg-props__empty">

          <Icon name="settings" size={32} />

          <p>选择画布上的节点以编辑属性</p>

        </div>

      </div>

    )

  }



  return (

    <div className="ffmpeg-props">

      <div className="ffmpeg-props__section">

        <h4>基本属性</h4>

        <label className="ffmpeg-props__field">

          <span>名称</span>

          <input value={elementName} onChange={e => { setElementName(e.target.value); setHasChanges(true) }} />

        </label>

        <label className="ffmpeg-props__field">

          <span>ID</span>

          <input value={elementId} onChange={e => { setElementId(e.target.value); setHasChanges(true) }} />

        </label>

      </div>



      {isServiceTask && (

        <div className="ffmpeg-props__section">

          <h4>FFmpeg 任务配置</h4>

          <PreviewSourceBar

            inputPath={previewSource.inputPath}

            mediaInfo={previewSource.mediaInfo}

            previewLoading={previewContext.previewLoading}

            previewError={previewContext.previewError}

            previewFrameTime={previewContext.previewFrameTime}

            previewAvailable={previewAvailable}

            previewTaskLabel={
              selectedElement?.id && entryTaskIds.has(selectedElement.id)
                ? (selectedElement.name || selectedElement.id)
                : null
            }

            entryProbing={activeEntryState?.probing}

            entryError={activeEntryState?.error}

            onRefreshPreview={handleSeekPreview}

            onGoToExecute={() => setActiveTab('execute')}

          />

          <label className="ffmpeg-props__field">

            <span>操作 action</span>

            <select

              value={ffmpegConfig.action}

              onChange={e => handleActionChange(e.target.value as FfmpegJobAction)}

            >

              {availableActions.map(action => (

                <option key={action} value={action}>{FFMPEG_OPERATION_LABELS[action]}</option>

              ))}

            </select>

          </label>



          {ffmpegConfig.action !== 'concat' && (
          <label className="ffmpeg-props__field">

            <span>输入 input.source</span>

            <select

              value={ffmpegConfig.input?.source || 'input'}

              onChange={e => updateInput({ source: e.target.value })}

            >

              {INPUT_SOURCES.map(opt => (

                <option key={opt.value} value={opt.value}>{opt.label}</option>

              ))}

            </select>

          </label>
          )}



          <>

            <label className="ffmpeg-props__field">

              <span>输出格式 output.format</span>

              <input

                value={ffmpegConfig.output?.format || 'mp4'}

                onChange={e => updateOutput({ format: e.target.value })}

              />

            </label>

            <label className="ffmpeg-props__field">

              <span>输出变量 output.var</span>

              <input

                value={ffmpegConfig.output?.var || ''}

                onChange={e => updateOutput({ var: e.target.value })}

                placeholder={`${selectedElement.id}.output`}

              />

            </label>

            <label className="ffmpeg-props__field ffmpeg-props__field--row">

              <input

                type="checkbox"

                checked={ffmpegConfig.output?.overwrite !== false}

                onChange={e => updateOutput({ overwrite: e.target.checked })}

              />

              <span>覆盖输出 overwrite</span>

            </label>

          </>



          {renderActionParams()}

          {renderFilters()}



          <div className="ffmpeg-props__subsection">

            <span className="ffmpeg-props__subsection-title">全局 global</span>

            <label className="ffmpeg-props__field ffmpeg-props__field--row">

              <input

                type="checkbox"

                checked={ffmpegConfig.global?.hideBanner !== false}

                onChange={e => updateGlobal({ hideBanner: e.target.checked })}

              />

              <span>hideBanner</span>

            </label>

            <label className="ffmpeg-props__field ffmpeg-props__field--row">

              <input

                type="checkbox"

                checked={ffmpegConfig.global?.noStdin !== false}

                onChange={e => updateGlobal({ noStdin: e.target.checked })}

              />

              <span>noStdin</span>

            </label>

          </div>



          <div className="ffmpeg-props__preview">

            <span className="ffmpeg-props__preview-label">JSON 配置</span>

            <pre className="ffmpeg-props__json">{JSON.stringify(ffmpegConfig, null, 2)}</pre>

          </div>

          <div className="ffmpeg-props__preview">

            <span className="ffmpeg-props__preview-label">命令预览</span>

            <pre>{commandPreview}</pre>

          </div>

        </div>

      )}



      <div className="ffmpeg-props__actions">

        <button

          className="ffmpeg-props__save"

          onClick={() => void handleSave()}

          disabled={!hasChanges}

        >

          保存到节点

        </button>

      </div>



      {showConfirmDialog && (

        <div className="ffmpeg-props__modal-overlay" onClick={handleConfirmCancel}>

          <div className="ffmpeg-props__modal" onClick={e => e.stopPropagation()}>

            <div className="ffmpeg-props__modal-header">

              <h4 className="ffmpeg-props__modal-title">未保存的修改</h4>

            </div>

            <div className="ffmpeg-props__modal-body">

              <p className="ffmpeg-props__confirm-text">

                当前节点有未保存的修改，是否保存后再切换？

              </p>

              <p className="ffmpeg-props__confirm-warning">

                直接切换将丢失未保存的修改。

              </p>

            </div>

            <div className="ffmpeg-props__modal-footer">

              <button

                type="button"

                className="ffmpeg-props__modal-btn ffmpeg-props__modal-btn--cancel"

                onClick={handleConfirmCancel}

              >

                取消

              </button>

              <button

                type="button"

                className="ffmpeg-props__modal-btn ffmpeg-props__modal-btn--discard"

                onClick={handleConfirmDiscard}

              >

                放弃修改

              </button>

              <button

                type="button"

                className="ffmpeg-props__modal-btn ffmpeg-props__modal-btn--save"

                onClick={() => void handleConfirmSave()}

              >

                保存并切换

              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  )

}



export default FfmpegPropertiesPanel


