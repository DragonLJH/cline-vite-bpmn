import SingleFfmpegOperationPage, { FFMPEG_OPERATION_PAGE_SPECS } from '../ffmpeg-operation/SingleFfmpegOperationPage'

const spec = FFMPEG_OPERATION_PAGE_SPECS.custom

const FfmpegCustomPage = () => <SingleFfmpegOperationPage action="custom" />

export default FfmpegCustomPage

export const pageMeta = {
  title: spec.title,
  description: spec.description,
  path: spec.path,
  icon: spec.icon
}
