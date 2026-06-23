import SingleFfmpegOperationPage, { FFMPEG_OPERATION_PAGE_SPECS } from '../ffmpeg-operation/SingleFfmpegOperationPage'

const spec = FFMPEG_OPERATION_PAGE_SPECS.watermark

const FfmpegWatermarkPage = () => <SingleFfmpegOperationPage action="watermark" />

export default FfmpegWatermarkPage

export const pageMeta = {
  title: spec.title,
  description: spec.description,
  path: spec.path,
  icon: spec.icon
}
