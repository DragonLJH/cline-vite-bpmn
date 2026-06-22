import React from 'react'
import type { MediaInfo } from '@/types/bpmn'
import { formatSecondsToTime } from '@/services/ffmpeg/timeUtils'

interface PreviewSourceBarProps {
  inputPath: string | null
  mediaInfo: MediaInfo | null
  previewLoading: boolean
  previewError: string | null
  previewFrameTime: number
  previewAvailable: boolean
  onRefreshPreview: (timeSeconds: number) => void
  onGoToExecute?: () => void
}

const PreviewSourceBar: React.FC<PreviewSourceBarProps> = ({
  inputPath,
  mediaInfo,
  previewLoading,
  previewError,
  previewFrameTime,
  previewAvailable,
  onRefreshPreview,
  onGoToExecute
}) => {
  const fileName = inputPath ? inputPath.split(/[/\\]/).pop() : null

  if (!previewAvailable) {
    return (
      <div className="ffmpeg-props__preview-bar ffmpeg-props__preview-bar--empty">
        <p>预览仅对初始输入有效；当前节点使用上一步输出时无法预览。</p>
      </div>
    )
  }

  if (!inputPath || !mediaInfo) {
    return (
      <div className="ffmpeg-props__preview-bar ffmpeg-props__preview-bar--empty">
        <p>请先在执行面板选择视频并探测信息。</p>
        {onGoToExecute && (
          <button type="button" className="ffmpeg-props__preview-btn" onClick={onGoToExecute}>
            前往执行面板
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="ffmpeg-props__preview-bar">
      <div className="ffmpeg-props__preview-meta">
        <strong>{fileName}</strong>
        <span>
          {mediaInfo.duration || '-'}
          {mediaInfo.width && mediaInfo.height ? ` · ${mediaInfo.width}x${mediaInfo.height}` : ''}
        </span>
      </div>
      <div className="ffmpeg-props__preview-actions">
        <label className="ffmpeg-props__preview-time">
          <span>预览时刻</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={Number(previewFrameTime.toFixed(1))}
            onChange={e => onRefreshPreview(parseFloat(e.target.value) || 0)}
          />
        </label>
        <button
          type="button"
          className="ffmpeg-props__preview-btn"
          disabled={previewLoading}
          onClick={() => onRefreshPreview(previewFrameTime)}
        >
          {previewLoading ? '截帧中...' : '刷新预览帧'}
        </button>
      </div>
      {previewError && <p className="ffmpeg-props__preview-error">{previewError}</p>}
      <p className="ffmpeg-props__preview-hint">
        当前预览帧: {formatSecondsToTime(previewFrameTime)}
      </p>
    </div>
  )
}

export default PreviewSourceBar
