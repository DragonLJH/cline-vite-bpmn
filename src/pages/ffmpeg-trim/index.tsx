import SingleFfmpegOperationPage, { FFMPEG_OPERATION_PAGE_SPECS } from '../ffmpeg-operation/SingleFfmpegOperationPage'

const spec = FFMPEG_OPERATION_PAGE_SPECS.trim

const FfmpegTrimPage = () => <SingleFfmpegOperationPage action="trim" />

export default FfmpegTrimPage

export const pageMeta = {
  title: spec.title,
  description: spec.description,
  path: spec.path,
  icon: spec.icon
}
