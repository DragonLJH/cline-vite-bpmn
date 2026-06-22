import { FFmpegCommandBuilder, WatermarkItem } from "../ffmpeg/FFmpegCommandBuilder"
import { FFmpegProgress, timeToSeconds } from "../ffmpeg/progressParser"
import { ffmpegExecutor } from "../ffmpeg/executorInstance"
import { appLogger } from "../logging/appLogger"

// 媒体信息接口定义
export interface StreamInfo {
    index: number
    type: 'video' | 'audio' | 'subtitle' | 'other'
    codec: string
    codec_long?: string
    width?: number
    height?: number
    fps?: number
    bitrate?: string
    sample_rate?: string
    channels?: number
    channel_layout?: string
    duration?: string
    language?: string
}

export interface MediaInfo {
    format: string
    duration: string
    size: string
    bitrate: string
    streams: StreamInfo[]
}

const executor = ffmpegExecutor

export interface TranscodeParams {

    input: string
    output: string

    // seek
    seek?: string
    preciseSeek?: boolean

    duration?: string

    video?: {
        codec?: string
        bitrate?: string
        fps?: number
        size?: string
    }

    audio?: {
        codec?: string
        bitrate?: string
    }

    // 图片能力
    watermark?: {
        image: string
        x?: number
        y?: number
        start?: string  // 水印开始时间（秒）
        end?: string    // 水印结束时间（秒）
        size?: number   // 水印大小（百分比，1-100）
    }

    cover?: string

    // metadata
    id3?: {
        title?: string
        artist?: string
        album?: string
    }
    
    // 新增性能选项
    performance?: {
        maxThreads?: number     // 最大线程数
        preset?: string         // 编码预设（ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow）
        priority?: 'low' | 'normal' | 'high'  // 进程优先级
        memoryLimit?: string    // 内存限制（如 "512M"）
    }
}

function applySeek(builder: FFmpegCommandBuilder, p: TranscodeParams) {

    if (!p.seek) return

    if (!p.preciseSeek) {
        builder.seekInput(p.seek)
    } else {
        builder.seekOutput(p.seek)
    }
}

export const videoService = {

    // ========================
    // 转码（完整能力）
    // ========================
    transcode(
        params: TranscodeParams,
        onProgress?: (p: FFmpegProgress) => void
    ) {

        const builder = new FFmpegCommandBuilder()
            .overwrite()
            .input(params.input)

        // seek
        applySeek(builder, params)

        // duration
        if (params.duration) {
            builder.duration(params.duration)
        }

        // watermark
        if (params.watermark) {
            // 确保使用传入的坐标值，如果未定义则使用默认值
            const watermarkX = params.watermark.x !== undefined ? params.watermark.x : 10
            const watermarkY = params.watermark.y !== undefined ? params.watermark.y : 10
            
            console.log('[videoService] Applying watermark with coordinates:', {
                image: params.watermark.image,
                x: watermarkX,
                y: watermarkY,
                start: params.watermark.start,
                end: params.watermark.end,
                size: params.watermark.size
            })
            
            builder.watermark(
                params.watermark.image,
                watermarkX,
                watermarkY,
                params.watermark.start,
                params.watermark.end,
                params.watermark.size
            )
        }

        // video
        if (params.video) {
            if (params.video.codec) builder.videoCodec(params.video.codec)
            if (params.video.bitrate) builder.bitrate(params.video.bitrate)
            if (params.video.fps) builder.fps(params.video.fps)
            if (params.video.size) builder.size(params.video.size)
        }


        // audio
        if (params.audio) {
            if (params.audio.codec) builder.audioCodec(params.audio.codec)
            if (params.audio.bitrate) builder.audioBitrate(params.audio.bitrate)
        }

        // cover（注意要在 codec 之后）
        if (params.cover) {
            builder.attachCover(params.cover)
        }

        // metadata
        if (params.id3) {
            builder.id3(params.id3)
        }

        // 应用性能优化选项
        if (params.performance) {
            // 如果指定了maxThreads，添加线程限制
            if (params.performance.maxThreads) {
                builder.threads(params.performance.maxThreads)
            }

            // 如果指定了preset，添加编码预设
            if (params.performance.preset) {
                builder.preset(params.performance.preset)
            }

            // 添加性能优化参数
            builder.performanceOptions()
        } else {
            // 默认使用中等质量预设
            builder.preset('medium')
        }

        // 如果没有指定视频编解码器，设置默认质量参数
        // 不强制指定 libx264，让 FFmpeg 自动选择系统可用的编码器
        if (!params.video?.codec) {
            builder.custom('-crf', '23')  // 默认质量级别
        }

        builder.output(params.output)

        // 构建executor选项
        const executorOptions: any = { onProgress }
        if (params.duration) {
            executorOptions.duration = timeToSeconds(params.duration)
        }
        
        // 应用性能选项到executor
        if (params.performance) {
            if (params.performance.maxThreads) {
                executorOptions.maxThreads = params.performance.maxThreads
            }
            if (params.performance.priority) {
                executorOptions.priority = params.performance.priority
            }
            if (params.performance.memoryLimit) {
                executorOptions.memoryLimit = params.performance.memoryLimit
            }
        }

        return executor.run(builder.build(), executorOptions)

    },

    // ========================
    // 截图
    // ========================
    screenshot(input: string, time: string, output: string) {

        const builder = new FFmpegCommandBuilder()
            .input(input)
            .seekInput(time)
            .custom("-vframes", "1")
            .output(output)

        return executor.run(builder.build())

    },

    // ========================
    // 精确截图
    // ========================
    screenshotAccurate(input: string, time: string, output: string) {

        const builder = new FFmpegCommandBuilder()
            .input(input)
            .seekOutput(time)
            .custom("-vframes", "1")
            .output(output)

        return executor.run(builder.build())

    },

    // ========================
    // 裁剪
    // ========================
    cut(
        input: string,
        output: string,
        start: string,
        duration: string,
        precise = false
    ) {

        const builder = new FFmpegCommandBuilder()
            .overwrite()
            .input(input)

        if (!precise) {
            builder.seekInput(start)
        } else {
            builder.seekOutput(start)
        }

        builder
            .duration(duration)
            .output(output)

        return executor.run(builder.build())

    },

    // ========================
    // 多水印处理（一次性处理所有水印，支持图片和文字混合）
    // ========================
    addWatermarks(
        params: {
            input: string
            output: string
            watermarks: WatermarkItem[]
            duration?: number
            performance?: {
                maxThreads?: number
                preset?: string
                priority?: 'low' | 'normal' | 'high'
                memoryLimit?: string
            }
        },
        onProgress?: (p: FFmpegProgress) => void
    ) {
        console.log('[videoService] addWatermarks received params:', {
            input: params.input,
            output: params.output,
            duration: params.duration,
            watermarkCount: params.watermarks.length,
            watermarks: params.watermarks.map((watermark, index) => ({
                index,
                type: watermark.type,
                x: watermark.x,
                y: watermark.y,
                start: watermark.start,
                end: watermark.end,
                opacity: watermark.opacity,
                image: watermark.type === 'image' ? watermark.image : undefined,
                text: watermark.type === 'text' ? watermark.text : undefined
            }))
        })
        appLogger.info('videoService addWatermarks received', {
            input: params.input,
            output: params.output,
            duration: params.duration,
            watermarkCount: params.watermarks.length,
            watermarkTypes: params.watermarks.map(watermark => watermark.type)
        })

        const builder = new FFmpegCommandBuilder()
            .overwrite()
            .input(params.input)
            .watermarks(params.watermarks)

        // 应用性能优化选项
        if (params.performance) {
            if (params.performance.maxThreads) {
                builder.threads(params.performance.maxThreads)
            }
            if (params.performance.preset) {
                builder.preset(params.performance.preset)
            }
            builder.performanceOptions()
        } else {
            // 默认使用中等质量预设，平衡速度和质量
            builder.preset('medium')
        }

        // 设置输出视频编码参数
        // 使用 -c:v copy 无法与 filter_complex 一起使用，需要重新编码
        // 不指定具体编码器，让 FFmpeg 自动选择默认编码器
        // 如果 FFmpeg 支持 libx264，它会优先使用；否则会使用其他可用编码器
        builder.custom('-crf', '23')  // 默认质量级别（平衡质量和文件大小）

        builder.output(params.output)

        // 构建executor选项
        const executorOptions: any = { onProgress }
        if (params.duration) {
            executorOptions.duration = params.duration
        }

        // 应用性能选项到executor
        if (params.performance) {
            if (params.performance.maxThreads) {
                executorOptions.maxThreads = params.performance.maxThreads
            }
            if (params.performance.priority) {
                executorOptions.priority = params.performance.priority
            }
            if (params.performance.memoryLimit) {
                executorOptions.memoryLimit = params.performance.memoryLimit
            }
        }

        return executor.run(builder.build(), executorOptions)
    },

    // ========================
    // 获取媒体信息
    // ========================
    async getMediaInfo(input: string): Promise<MediaInfo> {
        // 使用 FFmpegCommandBuilder 构建命令
        // 添加 -f null - 来获取信息而不需要实际输出文件
        // 添加 -hide_banner 减少输出信息
        // 添加 -analyzeduration 和 -probesize 限制分析时间
        const builder = new FFmpegCommandBuilder()
            .input(input)
            .custom("-hide_banner", "-f", "null", "-", "-analyzeduration", "5000000", "-probesize", "5000000")
        
        // 设置 15 秒超时，防止某些视频导致进程卡住
        const task = executor.run(builder.build(), {
            timeout: 15000
        })
        
        // 等待任务完成
        const result = await task.result
        
        // ffmpeg -i 输出到 stderr
        const output = result.stderr
        
        // 解析输出
        return this.parseMediaInfo(output)
    },

    // 解析 ffmpeg -i 输出
    parseMediaInfo(output: string): MediaInfo {
        const info: MediaInfo = {
            format: '',
            duration: '',
            size: '',
            bitrate: '',
            streams: []
        }

        const lines = output.split('\n')
        let currentStream: StreamInfo | null = null

        for (const line of lines) {
            // 解析格式
            const formatMatch = line.match(/Input #0, ([^,]+),/)
            if (formatMatch) {
                info.format = formatMatch[1]
            }

            // 解析时长
            const durationMatch = line.match(/Duration: ([^,]+)/)
            if (durationMatch) {
                info.duration = durationMatch[1]
            }

            // 解析大小
            const sizeMatch = line.match(/size: ([^,]+)/)
            if (sizeMatch) {
                info.size = sizeMatch[1]
            }

            // 解析比特率
            const bitrateMatch = line.match(/bitrate: ([^,]+)/)
            if (bitrateMatch) {
                info.bitrate = bitrateMatch[1]
            }

            // 解析流信息
            const streamMatch = line.match(/Stream #0:(\d+)(?:\(([^)]*)\))?: (Video|Audio|Subtitle): (.+)/i)
            if (streamMatch) {
                const [, index, lang, type, details] = streamMatch
                
                currentStream = {
                    index: parseInt(index),
                    type: type.toLowerCase() as 'video' | 'audio' | 'subtitle',
                    codec: '',
                    language: lang || undefined
                }

                // 解析详细信息
                const parts = details.split(', ')
                if (parts.length > 0) {
                    currentStream.codec = parts[0]
                }

                // 解析分辨率（视频）
                if (type === 'Video') {
                    const resMatch = details.match(/(\d{3,5})x(\d{3,5})/)
                    if (resMatch) {
                        currentStream.width = parseInt(resMatch[1])
                        currentStream.height = parseInt(resMatch[2])
                    }
                    
                    // 解析帧率
                    const fpsMatch = details.match(/(\d+(?:\.\d+)?) fps/)
                    if (fpsMatch) {
                        currentStream.fps = parseFloat(fpsMatch[1])
                    }
                }

                // 解析采样率（音频）
                if (type === 'Audio') {
                    const sampleRateMatch = details.match(/(\d+) Hz/)
                    if (sampleRateMatch) {
                        currentStream.sample_rate = sampleRateMatch[1]
                    }
                    
                    // 解析声道
                    const channelsMatch = details.match(/(mono|stereo|(\d+) channels)/)
                    if (channelsMatch) {
                        if (channelsMatch[1] === 'mono') {
                            currentStream.channels = 1
                            currentStream.channel_layout = 'mono'
                        } else if (channelsMatch[1] === 'stereo') {
                            currentStream.channels = 2
                            currentStream.channel_layout = 'stereo'
                        } else if (channelsMatch[2]) {
                            currentStream.channels = parseInt(channelsMatch[2])
                            currentStream.channel_layout = `${channelsMatch[2]} channels`
                        }
                    }
                }

                // 解析比特率
                const streamBitrateMatch = details.match(/(\d+) kb\/s/)
                if (streamBitrateMatch) {
                    currentStream.bitrate = `${streamBitrateMatch[1]} kb/s`
                }

                info.streams.push(currentStream)
            }

            // 解析流时长
            const streamDurationMatch = line.match(/Duration: ([^,]+)/)
            if (streamDurationMatch && currentStream) {
                currentStream.duration = streamDurationMatch[1]
            }
        }

        return info
    }

}