import React from 'react'
import type { FfmpegMediaInfo } from '../../shared/electron/ffmpegApi'
import './ProbeMediaInfoGrid.scss'

export type ProbeDisplayStatus = 'idle' | 'probing' | 'done' | 'failed'

interface ProbeField {
  key: string
  label: string
  skeletonWidth: string
  getValue: (info: FfmpegMediaInfo) => string | undefined
}

const PROBE_FIELDS: ProbeField[] = [
  {
    key: 'duration',
    label: '时长',
    skeletonWidth: '52%',
    getValue: info => info.duration
  },
  {
    key: 'resolution',
    label: '分辨率',
    skeletonWidth: '68%',
    getValue: info => (info.width && info.height ? `${info.width} × ${info.height}` : undefined)
  },
  {
    key: 'fps',
    label: '帧率',
    skeletonWidth: '40%',
    getValue: info => (info.fps != null ? `${info.fps} fps` : undefined)
  },
  {
    key: 'videoCodec',
    label: '视频编码',
    skeletonWidth: '56%',
    getValue: info => info.videoCodec
  },
  {
    key: 'audioCodec',
    label: '音频编码',
    skeletonWidth: '48%',
    getValue: info => info.audioCodec
  },
  {
    key: 'bitrate',
    label: '码率',
    skeletonWidth: '44%',
    getValue: info => info.bitrate
  }
]

function SkeletonBar({ width }: { width: string }) {
  return <span className="probe-info-grid__skeleton" style={{ width }} aria-hidden />
}

interface ProbeMediaInfoGridProps {
  status: ProbeDisplayStatus
  info: FfmpegMediaInfo | null
}

const ProbeMediaInfoGrid: React.FC<ProbeMediaInfoGridProps> = ({ status, info }) => {
  if (status === 'idle' && !info) return null

  const showSkeleton = status === 'probing'

  return (
    <section className="probe-info-grid" aria-busy={showSkeleton}>
      <div className="probe-info-grid__header">
        <h3>媒体信息</h3>
        {showSkeleton && <span className="probe-info-grid__badge">接收中…</span>}
        {status === 'done' && <span className="probe-info-grid__badge probe-info-grid__badge--done">已完成</span>}
        {status === 'failed' && <span className="probe-info-grid__badge probe-info-grid__badge--failed">探测失败</span>}
      </div>

      <div className="probe-info-grid__items">
        {PROBE_FIELDS.map(field => {
          const value = info ? field.getValue(info) : undefined
          return (
            <div key={field.key} className="probe-info-grid__item">
              <div className="probe-info-grid__label">{field.label}</div>
              <div
                className={[
                  'probe-info-grid__value',
                  value ? 'probe-info-grid__value--ready' : '',
                  showSkeleton && !value ? 'probe-info-grid__value--pending' : ''
                ].filter(Boolean).join(' ')}
              >
                {value || (showSkeleton ? <SkeletonBar width={field.skeletonWidth} /> : '—')}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default ProbeMediaInfoGrid
