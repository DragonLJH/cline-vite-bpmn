import type { MediaInfo, StreamInfo } from './videoService'
import type { FlatMediaInfo } from './types'

function parseDurationSeconds(duration: string | undefined): number | undefined {
  if (!duration) return undefined
  const parts = duration.trim().split(':').map(Number)
  if (parts.some(n => Number.isNaN(n))) return undefined
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }
  const asNumber = parseFloat(duration)
  return Number.isFinite(asNumber) ? asNumber : undefined
}

function pickVideoStream(streams: StreamInfo[]): StreamInfo | undefined {
  return streams.find(s => s.type === 'video')
}

function pickAudioStream(streams: StreamInfo[]): StreamInfo | undefined {
  return streams.find(s => s.type === 'audio')
}

export function toFlatMediaInfo(detailed: MediaInfo, raw?: string): FlatMediaInfo {
  const video = pickVideoStream(detailed.streams)
  const audio = pickAudioStream(detailed.streams)

  return {
    duration: detailed.duration,
    durationSeconds: parseDurationSeconds(detailed.duration),
    width: video?.width,
    height: video?.height,
    fps: video?.fps,
    videoCodec: video?.codec,
    audioCodec: audio?.codec,
    bitrate: detailed.bitrate,
    raw
  }
}

export function parseFlatMediaInfo(stderr: string): FlatMediaInfo {
  const durationMatch = stderr.match(/Duration: ([^,]+)/)
  const duration = durationMatch?.[1]?.trim()

  const videoMatch = stderr.match(/Stream #\d+:\d+[^:]*: Video: ([^,\s]+)[^,]*(?:,\s*(\d+)x(\d+))?/)
  const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s*fps/)
  const audioMatch = stderr.match(/Stream #\d+:\d+[^:]*: Audio: ([^,\s]+)/)
  const bitrateMatch = stderr.match(/bitrate:\s*([^,\n]+)/i)

  return {
    duration,
    durationSeconds: parseDurationSeconds(duration),
    width: videoMatch?.[2] ? parseInt(videoMatch[2], 10) : undefined,
    height: videoMatch?.[3] ? parseInt(videoMatch[3], 10) : undefined,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : undefined,
    videoCodec: videoMatch?.[1],
    audioCodec: audioMatch?.[1],
    bitrate: bitrateMatch?.[1]?.trim(),
    raw: stderr
  }
}
