export {
  DEFAULT_VIDEO_CODEC,
  resolveVideoCodec,
  supportsX264Preset
} from './codecResolver'

export {
  DEFAULT_FFMPEG_JOB_CONFIG,
  DEFAULT_FFMPEG_CONCAT_COPY,
  DEFAULT_FFMPEG_CONCAT_XFADE,
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
  FfmpegJobConcat,
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
  canUseMergeAction,
  collectEntryInputTasks,
  collectUpstreamServiceTasks,
  resolveBranchOutputPaths,
  validateCopyMergeCompatibility
} from './mergeInputs'

export type { CopyMergeValidationResult } from './mergeInputs'

export {
  buildXfadeJobArgs,
  computeXfadeOffsets,
  isXfadeConcatMode,
  validateXfadeInputs,
  DEFAULT_XFADE_DURATION,
  DEFAULT_XFADE_FPS,
  DEFAULT_XFADE_TRANSITION
} from './xfadeCommandBuilder'

export type { XfadeCommandOptions } from './xfadeCommandBuilder'

export {
  buildJobCommand,
  formatFfmpegCommandPreview,
  previewJobCommand
} from './jobCommandBuilder'

export type { BuildJobCommandOptions } from './jobCommandBuilder'
