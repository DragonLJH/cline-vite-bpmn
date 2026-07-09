export {
  DEFAULT_VIDEO_CODEC,
  resolveVideoCodec,
  supportsX264Preset
} from './codecResolver'

export {
  DEFAULT_FFMPEG_JOB_CONFIG,
  FFMPEG_ACTION_LABELS,
  getJobOutputFormat,
  getJobOutputVar,
  isFfmpegJobConfig,
  legacyToJobConfig,
  parseFfmpegJobConfig,
  parseTrimDuration,
  resolveFilterImage,
  resolveJobInput,
  serializeFfmpegJobConfig
} from './jobConfig'

export type {
  FfmpegDrawtextFilter,
  FfmpegJobAction,
  FfmpegJobAudio,
  FfmpegJobConfig,
  FfmpegJobFilter,
  FfmpegJobGlobal,
  FfmpegJobInput,
  FfmpegJobOutput,
  FfmpegJobTrim,
  FfmpegJobCrop,
  FfmpegJobCropAdvanced,
  FfmpegJobCropKeyframe,
  FfmpegJobVideo,
  FfmpegOverlayFilter,
  LegacyFfmpegTaskConfig
} from './jobConfig'

export {
  buildCropSegments,
  buildKeyframeCropFilterComplex,
  findKeyframeIndexAtTime,
  getCropDurationHint,
  isKeyframeCropMode,
  resolveCropAtTime,
  sortCropKeyframes,
  toEvenCrop
} from './cropKeyframes'

export type { CropSegment, KeyframeCropFilterResult } from './cropKeyframes'

export {
  buildJobCommand,
  formatFfmpegCommandPreview,
  previewJobCommand
} from './jobCommandBuilder'
