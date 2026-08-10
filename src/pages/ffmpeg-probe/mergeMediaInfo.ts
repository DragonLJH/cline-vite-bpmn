import type { FfmpegMediaInfo } from '../../shared/electron/ffmpegApi'

export function mergeMediaInfo(
  prev: FfmpegMediaInfo | null,
  next: Partial<FfmpegMediaInfo>
): FfmpegMediaInfo {
  const merged: FfmpegMediaInfo = { ...(prev || {}) }
  const target = merged as Record<string, unknown>

  for (const [key, value] of Object.entries(next) as [keyof FfmpegMediaInfo, FfmpegMediaInfo[keyof FfmpegMediaInfo]][]) {
    if (value !== undefined && value !== null && value !== '') {
      target[key] = value
    }
  }

  return merged
}
