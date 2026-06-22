import type { FfmpegTranscodeParams } from './types'

const TRANSCODE_FLAG_MAP: Record<string, keyof FfmpegTranscodeParams> = {
  '-c:v': 'videoCodec',
  '-vcodec': 'videoCodec',
  '-c:a': 'audioCodec',
  '-acodec': 'audioCodec',
  '-b:v': 'videoBitrate',
  '-b:a': 'audioBitrate',
  '-preset': 'preset',
  '-crf': 'crf',
  '-r': 'fps'
}

const SCALE_PATTERN = /^scale=(\d+x\d+)$/

export function parseArgsToTranscodeParams(args: string[]): FfmpegTranscodeParams {
  const params: FfmpegTranscodeParams = { extraArgs: [] }
  let i = 0

  while (i < args.length) {
    const flag = args[i]

    if (flag === '-vf' && i + 1 < args.length) {
      const vfValue = args[i + 1]
      const scaleMatch = vfValue.match(SCALE_PATTERN)
      if (scaleMatch) {
        params.resolution = scaleMatch[1]
      } else {
        params.extraArgs!.push('-vf', vfValue)
      }
      i += 2
      continue
    }

    const paramKey = TRANSCODE_FLAG_MAP[flag]
    if (paramKey && i + 1 < args.length) {
      const value = args[i + 1]
      if (paramKey === 'crf' || paramKey === 'fps') {
        params[paramKey] = Number(value)
      } else {
        params[paramKey] = value
      }
      i += 2
      continue
    }

    params.extraArgs!.push(flag)
    i += 1
  }

  if (params.extraArgs!.length === 0) {
    delete params.extraArgs
  }

  return params
}

export function parseExtraArgsInput(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []

  const args: string[] = []
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  for (const line of trimmed.split('\n')) {
    const lineTrimmed = line.trim()
    if (!lineTrimmed) continue

    regex.lastIndex = 0
    while ((match = regex.exec(lineTrimmed)) !== null) {
      args.push(match[1] ?? match[2] ?? match[3])
    }
  }

  return args
}

export function formatExtraArgsForInput(args: string[] | undefined): string {
  if (!args?.length) return ''
  return args.join('\n')
}
