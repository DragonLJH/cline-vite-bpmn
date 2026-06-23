import SingleFfmpegOperationPage, { FFMPEG_OPERATION_PAGE_SPECS } from '../ffmpeg-operation/SingleFfmpegOperationPage'

const spec = FFMPEG_OPERATION_PAGE_SPECS.transcode

const FfmpegTranscodePage = () => <SingleFfmpegOperationPage action="transcode" />

export default FfmpegTranscodePage

export const pageMeta = {
  title: spec.title,
  description: spec.description,
  path: spec.path,
  icon: spec.icon
}
