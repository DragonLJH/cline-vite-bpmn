import React, { useMemo, useCallback } from 'react'

import ClipTimeline, {
  type ClipTimelineMarker,
  type ClipTimelineThumbnail,
  type ClipTimelineSegment
} from '../../../../components/ffmpeg/ClipTimeline'
import {
  DEFAULT_FFMPEG_CONFIG,
  readFfmpegConfigFromElement
} from '../../../../services/ffmpeg/configCodec'
import { formatSecondsToTime, parseTimeToSeconds } from '../../../../services/ffmpeg/timeUtils'
import { collectEntryInputTasks } from '../../../../shared/ffmpeg/mergeInputs'
import { sortCropKeyframes } from '../../../../shared/ffmpeg/cropKeyframes'
import { useFfmpegBpmnStore } from '../../../../stores/ffmpegBpmnStore'
import type { FfmpegJobAction, FfmpegJobConfig } from '../../../../types/bpmn'
import { parseWorkflowGraph } from '../../../../utils/bpmnParser'

import './index.scss'

const TIMELINE_ACTIONS = new Set<FfmpegJobAction>(['trim', 'crop', 'watermark'])
const TIMELINE_SLOT_COUNT = 10

function isTimelineAction(action: FfmpegJobAction): boolean {
  return TIMELINE_ACTIONS.has(action)
}

function buildTimelineSlots(
  durationSeconds: number,
  currentSeconds: number,
  currentDataUrl: string | null
): ClipTimelineThumbnail[] {
  const count = TIMELINE_SLOT_COUNT
  const safeDuration = Math.max(durationSeconds, 0.5)
  const lastFrameTime = Math.max(0, safeDuration - 0.1)
  const slots: ClipTimelineThumbnail[] = Array.from({ length: count }, (_, index) => {
    const time = (lastFrameTime * index) / (count - 1)
    return {
      time,
      dataUrl: null
    }
  })

  if (currentDataUrl) {
    const nearestIndex = slots.reduce((bestIndex, slot, index) => {
      const best = slots[bestIndex]
      return Math.abs(slot.time - currentSeconds) < Math.abs(best.time - currentSeconds)
        ? index
        : bestIndex
    }, 0)
    slots[nearestIndex] = {
      ...slots[nearestIndex],
      time: currentSeconds,
      dataUrl: currentDataUrl
    }
  }

  return slots
}

const FfmpegTimelinePanel: React.FC = () => {
  const {
    selectedElement,
    modelerRef,
    bpmnXml,
    pendingFfmpegConfigs,
    previewContext,
    getPreviewSourceForTask,
    setPendingFfmpegConfig,
    setHasUnsavedChanges,
    refreshPreview
  } = useFfmpegBpmnStore()

  const isServiceTask = selectedElement?.type === 'bpmn:ServiceTask'
  const workflowGraph = useMemo(() => parseWorkflowGraph(bpmnXml), [bpmnXml])
  const entryTaskIds = useMemo(
    () => new Set((workflowGraph ? collectEntryInputTasks(workflowGraph) : []).map(task => task.id)),
    [workflowGraph]
  )
  const previewSource = getPreviewSourceForTask(
    selectedElement?.id && entryTaskIds.has(selectedElement.id) ? selectedElement.id : previewContext.activePreviewTaskId
  )

  const ffmpegConfig = useMemo<FfmpegJobConfig | null>(() => {
    if (!selectedElement || !isServiceTask) return null
    const pending = pendingFfmpegConfigs[selectedElement.id]
    if (pending) return pending
    const loaded = readFfmpegConfigFromElement(modelerRef, selectedElement.id, selectedElement.businessObject)
    return loaded.action === 'probe'
      ? { ...DEFAULT_FFMPEG_CONFIG, input: { source: 'input' } }
      : loaded
  }, [isServiceTask, modelerRef, pendingFfmpegConfigs, selectedElement])

  const previewAvailable = Boolean(ffmpegConfig)
    && ffmpegConfig!.action !== 'concat'
    && ffmpegConfig!.input?.source !== 'prev'
    && ffmpegConfig!.input?.source !== 'merge'
    && (entryTaskIds.has(selectedElement?.id || '') || ffmpegConfig!.input?.source === 'input')

  const mediaDuration = previewSource.mediaInfo?.durationSeconds
    || parseTimeToSeconds(previewSource.mediaInfo?.duration)
    || 60

  const showTimeline = Boolean(ffmpegConfig && isTimelineAction(ffmpegConfig.action))
  const timelineThumbnails = useMemo(
    () => buildTimelineSlots(
      mediaDuration,
      previewContext.previewFrameTime,
      previewContext.previewFrameDataUrl
    ),
    [mediaDuration, previewContext.previewFrameDataUrl, previewContext.previewFrameTime]
  )

  const updateConfig = useCallback((next: FfmpegJobConfig) => {
    if (!selectedElement || !isServiceTask) return
    setPendingFfmpegConfig(selectedElement.id, next)
    setHasUnsavedChanges(true)
  }, [isServiceTask, selectedElement, setHasUnsavedChanges, setPendingFfmpegConfig])

  const handleSeekPreview = useCallback((seconds: number) => {
    if (previewAvailable) {
      void refreshPreview(seconds)
    }
  }, [previewAvailable, refreshPreview])

  if (!selectedElement) {
    return (
      <div className="ffmpeg-timeline-panel ffmpeg-timeline-panel--empty">
        <span>选择服务任务节点后显示剪辑时间轴</span>
      </div>
    )
  }

  if (!isServiceTask || !ffmpegConfig || !showTimeline) {
    return (
      <div className="ffmpeg-timeline-panel ffmpeg-timeline-panel--empty">
        <span>当前节点没有可编辑的时间轴操作</span>
      </div>
    )
  }

  const range = ffmpegConfig.action === 'trim'
    ? {
      start: parseTimeToSeconds(ffmpegConfig.trim?.start),
      end: parseTimeToSeconds(ffmpegConfig.trim?.start) + Math.max(0.5, parseTimeToSeconds(ffmpegConfig.trim?.duration) || 10)
    }
    : undefined

  const markers: ClipTimelineMarker[] = ffmpegConfig.action === 'crop'
    ? sortCropKeyframes(ffmpegConfig.cropAdvanced?.keyframes || []).map(item => ({
      time: item.time,
      type: 'keyframe',
      label: `裁剪关键帧 ${formatSecondsToTime(item.time)}`
    }))
    : []

  const segments: ClipTimelineSegment[] = ffmpegConfig.action === 'watermark'
    ? (ffmpegConfig.filters || []).map((filter, index) => ({
      id: `filter-${index}`,
      start: parseTimeToSeconds(filter.start),
      end: filter.end != null ? parseTimeToSeconds(filter.end) : mediaDuration,
      label: filter.type === 'drawtext'
        ? `文字 ${index + 1}`
        : `图片 ${index + 1}`
    }))
    : []

  return (
    <div className="ffmpeg-timeline-panel">
      <div className="ffmpeg-timeline-panel__header">
        <span>时间操作轴</span>
        <span>{ffmpegConfig.action}</span>
      </div>
      <ClipTimeline
        inputPath={previewSource.inputPath}
        durationSeconds={mediaDuration}
        currentSeconds={previewContext.previewFrameTime}
        thumbnails={timelineThumbnails}
        range={range}
        markers={markers}
        segments={segments}
        disabled={!previewAvailable || !previewSource.inputPath}
        durationEstimated={!previewSource.mediaInfo}
        loading={previewContext.previewLoading}
        onSeek={handleSeekPreview}
        onRangeChange={nextRange => {
          if (ffmpegConfig.action !== 'trim') return
          updateConfig({
            ...ffmpegConfig,
            trim: {
              ...ffmpegConfig.trim,
              start: formatSecondsToTime(nextRange.start),
              duration: formatSecondsToTime(nextRange.end - nextRange.start)
            }
          })
        }}
        onSegmentChange={(id, patch) => {
          if (ffmpegConfig.action !== 'watermark') return
          const index = Number(id.replace('filter-', ''))
          const segment = segments.find(item => item.id === id)
          const filter = ffmpegConfig.filters?.[index]
          if (!segment || !filter || Number.isNaN(index)) return
          const start = patch.start ?? segment.start
          const end = patch.end ?? segment.end
          const filters = [...(ffmpegConfig.filters || [])]
          filters[index] = {
            ...filter,
            start: formatSecondsToTime(start),
            end: formatSecondsToTime(end)
          }
          updateConfig({ ...ffmpegConfig, filters })
        }}
      />
    </div>
  )
}

export default FfmpegTimelinePanel
