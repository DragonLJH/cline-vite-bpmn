import SingleFfmpegOperationPage, { FFMPEG_OPERATION_PAGE_SPECS } from '../ffmpeg-operation/SingleFfmpegOperationPage'

const spec = FFMPEG_OPERATION_PAGE_SPECS.probe

const FfmpegProbePage = () => <SingleFfmpegOperationPage action="probe" />

export default FfmpegProbePage

export const pageMeta = {
  title: spec.title,
  description: spec.description,
  path: spec.path,
  icon: spec.icon
}
