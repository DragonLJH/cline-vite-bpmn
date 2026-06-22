export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function parseTimeToSeconds(value: string | number | undefined): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  const trimmed = value.trim()
  if (!trimmed) return 0

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(part => parseFloat(part))
    if (parts.some(n => Number.isNaN(n))) return 0
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }
    return parts[0] || 0
  }

  const asNumber = parseFloat(trimmed)
  return Number.isFinite(asNumber) ? asNumber : 0
}

export function formatSecondsToTime(
  seconds: number,
  opts?: { ms?: boolean }
): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60

  if (opts?.ms) {
    const whole = Math.floor(s)
    const ms = Math.round((s - whole) * 1000)
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
    }
    return `${m}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
  }

  const whole = Math.floor(s)
  const frac = s - whole
  const fracStr = frac > 0.001 ? `.${Math.round(frac * 10)}` : ''

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}${fracStr}`
  }
  if (m > 0) {
    return `${m}:${String(whole).padStart(2, '0')}${fracStr}`
  }
  return `${whole}${fracStr}`
}

export function formatSecondsToFfmpegTime(seconds: number): string {
  return formatSecondsToTime(seconds, { ms: true })
}
