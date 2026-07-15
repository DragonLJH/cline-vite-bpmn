export { DEFAULT_FFMPEG_CONFIG, parseFfmpegConfigJson, serializeFfmpegConfig, readFfmpegConfigFromBusinessObject, updateFfmpegConfigOnElement, FFMPEG_OPERATION_LABELS } from './configCodec'

export {
  DEFAULT_FFMPEG_JOB_CONFIG,
  DEFAULT_FFMPEG_CONCAT_COPY,
  DEFAULT_FFMPEG_CONCAT_XFADE,
  FFMPEG_ACTION_LABELS,
  parseFfmpegJobConfig,
  serializeFfmpegJobConfig,
  isFfmpegJobConfig,
  legacyToJobConfig,
  getJobOutputFormat,
  resolveJobInput,
  resolveFilterImage,
  getJobOutputVar,
  parseTrimDuration
} from './jobConfig'

export type {
  FfmpegJobConfig,
  FfmpegJobAction,
  FfmpegJobConcat,
  FfmpegJobInput,
  FfmpegJobOutput,
  FfmpegJobVideo,
  FfmpegJobAudio,
  FfmpegJobFilter,
  FfmpegDrawtextFilter,
  FfmpegOverlayFilter,
  FfmpegJobGlobal,
  FfmpegJobTrim,
  FfmpegJobCrop,
  FfmpegJobCropAdvanced,
  FfmpegJobCropKeyframe
} from './jobConfig'

export { buildJobCommand, previewJobCommand, formatFfmpegCommandPreview } from './jobCommandBuilder'

export { resolveVideoCodec, supportsX264Preset, DEFAULT_VIDEO_CODEC } from './codecResolver'

export {
  canUseMergeAction,
  collectEntryInputTasks,
  collectUpstreamServiceTasks,
  validateCopyMergeCompatibility
} from '../../shared/ffmpeg/mergeInputs'

export { createDefaultBpmnXml, createParallelMergeBpmnXml, DEFAULT_BPMN_XML } from './defaultTemplate'

export { buildFfmpegArgs, buildFfmpegCommand, buildOperationArgs, previewFfmpegCommand, resolveVariable, getOutputExtension, resolveWatermarkPath } from './presets'

export { parseArgsToTranscodeParams, parseExtraArgsInput, formatExtraArgsForInput } from './argParser'

export { VIDEO_CODEC_OPTIONS, AUDIO_CODEC_OPTIONS, PRESET_OPTIONS, WATERMARK_POSITION_OPTIONS, DEFAULT_TRANSCODE_PARAMS, DEFAULT_WATERMARK_PARAMS } from './types'

export type { FfmpegParams, FfmpegTranscodeParams, FfmpegTrimParams, FfmpegExtractAudioParams, FfmpegWatermarkParams, WatermarkPosition } from './types'

export { runWorkflow, getWorkflowSummary } from './workflowRunner'

export { migrateProbeNodesFromBpmnXml, applyProbeMigrationToBpmnXml } from './probeNodeMigration'

export { resolveWorkflowGraphForRun } from './workflowGraphResolver'

export type { WorkflowRunContext } from './workflowGraphResolver'

export type { WorkflowStepResult, WorkflowRunResult, StepStatus, WorkflowEntryPayload, WorkflowEntryInputsArg } from './workflowRunner'
