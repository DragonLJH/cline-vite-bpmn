import type { FfmpegMediaInfo } from '../../shared/electron/ffmpegApi'

export function mergeMediaInfo(
  prev: FfmpegMediaInfo | null,
  next: Partial<FfmpegMediaInfo>
): FfmpegMediaInfo {
  const merged: FfmpegMediaInfo = { ...(prev || {}) }

  for (const [key, value] of Object.entries(next) as [keyof FfmpegMediaInfo, FfmpegMediaInfo[keyof FfmpegMediaInfo]][]) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value
    }
  }

  return merged
}
