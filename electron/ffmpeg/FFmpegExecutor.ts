import { spawn, ChildProcessWithoutNullStreams } from "child_process"
import { parseProgress, timeToSeconds, FFmpegProgress } from "./progressParser"
import { appLogger } from "../logging/appLogger"
import { getFfmpegBinary } from "./ffmpegPaths"

export interface ExecutorOptions {
  duration?: number
  timeout?: number  // 超时时间（毫秒），超时后自动终止进程
  onProgress?: (p: FFmpegProgress) => void
  onLog?: (log: string) => void
  
  // 新增资源控制选项
  maxThreads?: number       // 最大线程数（默认：CPU核心数/2）
  priority?: 'low' | 'normal' | 'high'  // 进程优先级
  memoryLimit?: string      // 内存限制（如 "512M"）
}

export interface FFmpegResult {
  success: boolean
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  errorReason?: string
}

export interface FFmpegTask {
  process: ChildProcessWithoutNullStreams
  cancel: () => void
  result: Promise<FFmpegResult>
}

export class FFmpegExecutor {

  private ffmpegPath: string
  private currentPid?: number

  constructor() {
    this.ffmpegPath = getFfmpegBinary()
    console.log(`[FFmpegExecutor] FFmpeg path: ${this.ffmpegPath}`)
  }

  /**
   * 应用资源限制到FFmpeg参数
   */
  private applyResourceLimits(args: string[], options: ExecutorOptions): string[] {
    const finalArgs = [...args]
    
    // 如果指定了maxThreads且args中没有-threads参数，添加线程限制
    if (options.maxThreads && !finalArgs.includes('-threads')) {
      finalArgs.push('-threads', String(options.maxThreads))
    }
    
    // 如果指定了memoryLimit，添加内存限制参数
    if (options.memoryLimit && !finalArgs.includes('-max_muxing_queue_size')) {
      finalArgs.push('-max_muxing_queue_size', '1024')
    }
    
    return finalArgs
  }

  private formatCommandLine(args: string[]): string {
    const quoted = args.map(arg => (/\s/.test(arg) ? `"${arg}"` : arg))
    return `${this.ffmpegPath} ${quoted.join(' ')}`
  }

  /**
   * 获取Windows优先级类
   */
  private getWindowsPriorityClass(priority: 'low' | 'normal' | 'high'): string {
    const priorityMap = {
      low: 'BELOWNORMAL',
      normal: 'NORMAL',
      high: 'ABOVENORMAL'
    }
    return priorityMap[priority]
  }

  /**
   * 获取Unix nice值
   */
  private getUnixNiceValue(priority: 'low' | 'normal' | 'high'): number {
    const niceMap = {
      low: 10,    // 较低优先级
      normal: 0,  // 普通优先级
      high: -10   // 较高优先级（需要root权限）
    }
    return niceMap[priority]
  }

  /**
   * 分析 FFmpeg 错误信息，提取关键错误原因
   */
  private analyzeFFmpegError(stderr: string): string {
    const errorPatterns = [
      // 文件相关错误
      { pattern: /No such file or directory/i, message: "文件不存在或目录错误" },
      { pattern: /Permission denied/i, message: "文件权限不足" },
      { pattern: /Is a directory/i, message: "路径是目录而非文件" },
      { pattern: /Not a directory/i, message: "路径不是目录" },
      { pattern: /Read-only file system/i, message: "文件系统只读" },
      { pattern: /No space left on device/i, message: "磁盘空间不足" },
      
      // 输入文件错误
      { pattern: /Invalid data found when processing input/i, message: "输入文件数据无效或损坏" },
      { pattern: /Could not find file with path/i, message: "找不到输入文件" },
      { pattern: /Unable to find a suitable output format/i, message: "无法确定输出格式" },
      { pattern: /Error opening input file/i, message: "无法打开输入文件" },
      
      // 编解码器错误
      { pattern: /Unknown encoder/i, message: "不支持的编码器" },
      { pattern: /Unknown decoder/i, message: "不支持的解码器" },
      { pattern: /Codec not supported/i, message: "编解码器不支持" },
      { pattern: /Encoder not found/i, message: "找不到编码器" },
      { pattern: /Decoder not found/i, message: "找不到解码器" },
      
      // 参数错误
      { pattern: /Invalid argument/i, message: "无效的参数" },
      { pattern: /Too many arguments/i, message: "参数过多" },
      { pattern: /Option not found/i, message: "选项不存在" },
      { pattern: /Invalid value/i, message: "无效的值" },
      
      // 输出文件错误
      { pattern: /Error opening output file/i, message: "无法打开输出文件" },
      { pattern: /Error opening output files/i, message: "无法打开输出文件" },
      { pattern: /Output file already exists/i, message: "输出文件已存在" },
      
      // 滤镜错误
      { pattern: /Filter .* not found/i, message: "找不到滤镜" },
      { pattern: /Simple filtergraph .* was expected/i, message: "滤镜图配置错误" },
      { pattern: /Too many inputs/i, message: "滤镜输入过多" },
      { pattern: /Too many outputs/i, message: "滤镜输出过多" },
      
      // 网络错误
      { pattern: /Connection timed out/i, message: "网络连接超时" },
      { pattern: /Connection refused/i, message: "网络连接被拒绝" },
      { pattern: /Network unreachable/i, message: "网络不可达" },
      
      // 内存错误
      { pattern: /Out of memory/i, message: "内存不足" },
      { pattern: /Cannot allocate memory/i, message: "无法分配内存" },
      
      // 进程错误
      { pattern: /Killed/i, message: "进程被终止" },
      { pattern: /Signal received/i, message: "收到终止信号" },
    ]

    // 检查错误模式
    for (const { pattern, message } of errorPatterns) {
      if (pattern.test(stderr)) {
        return message
      }
    }

    // 提取最后一行错误信息
    const lines = stderr.split('\n').filter(line => line.trim())
    const lastLines = lines.slice(-3).join(' | ')
    
    return `未知错误: ${lastLines || '无错误信息'}`
  }

  run(args: string[], options: ExecutorOptions = {}): FFmpegTask {
    // 应用资源限制
    const finalArgs = this.applyResourceLimits(args, options)
    const commandLine = this.formatCommandLine(finalArgs)
    console.log(`[FFmpegExecutor] 执行命令: ${commandLine}`)
    appLogger.info('FFmpeg command', { command: commandLine })
    
    // 根据平台和优先级选择执行方式
    let proc: ChildProcessWithoutNullStreams
    
    if (options.priority && process.platform === 'win32') {
      // Windows系统使用start命令设置优先级
      const priorityClass = this.getWindowsPriorityClass(options.priority)
      proc = spawn('cmd', ['/c', 'start', priorityClass, '/B', this.ffmpegPath, ...finalArgs])
    } else if (options.priority && process.platform !== 'win32') {
      // Unix系统使用nice命令设置优先级
      const niceValue = this.getUnixNiceValue(options.priority)
      proc = spawn('nice', ['-n', String(niceValue), this.ffmpegPath, ...finalArgs])
    } else {
      // 默认执行方式
      proc = spawn(this.ffmpegPath, finalArgs)
    }
    
    // 记录进程ID
    if (proc.pid) {
      this.currentPid = proc.pid
      console.log(`[FFmpegExecutor] FFmpeg process started with PID: ${proc.pid}`)
      appLogger.info('FFmpeg process started', {
        pid: proc.pid,
        args: finalArgs,
        ffmpegPath: this.ffmpegPath
      })
      console.log(`[FFmpegExecutor] Applied resource limits:`, {
        maxThreads: options.maxThreads ?? 'auto',
        priority: options.priority ?? 'normal',
        memoryLimit: options.memoryLimit ?? 'none'
      })
    }

    let stdout = ""
    let stderr = ""
    let errorReason: string | undefined
    let timeoutId: NodeJS.Timeout | null = null

    // 设置超时机制
    if (options.timeout && options.timeout > 0) {
      timeoutId = setTimeout(() => {
        console.warn(`[FFmpegExecutor] Process timeout after ${options.timeout}ms, terminating...`)
        this.currentPid = undefined
        
        // 强制终止进程
        if (proc.pid) {
          const isWindows = process.platform === "win32"
          const killCommand = isWindows ? "taskkill" : "kill"
          const killArgs = isWindows 
            ? ["/PID", proc.pid.toString(), "/F"]
            : ["-9", proc.pid.toString()]
          
          const killProc = spawn(killCommand, killArgs)
          killProc.on("close", () => {
            proc.kill("SIGTERM")
          })
          killProc.on("error", () => {
            proc.kill("SIGTERM")
          })
        } else {
          proc.kill("SIGTERM")
        }
      }, options.timeout)
    }

    const result = new Promise<FFmpegResult>((resolve, reject) => {

      proc.stdout.on("data", (data) => {
        stdout += data.toString()
      })

      proc.stderr.on("data", (data) => {

        const line = data.toString()
        stderr += line

        options.onLog?.(line)

        const progress = parseProgress(line)

        if (progress) {

          if (options.duration && progress.time) {

            const sec = timeToSeconds(progress.time)
            progress.percent = Math.max(0, Math.min(100, (sec / options.duration) * 100))

          }

          options.onProgress?.(progress)
        }

      })

      proc.on("close", (code, signal) => {
        // 清除超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        
        // 清除进程ID记录
        this.currentPid = undefined
        
        // 输出结束信息
        console.log(`[FFmpegExecutor] 执行结束: code=${code}, signal=${signal ?? 'none'}, success=${code === 0}`)
        appLogger.info('FFmpeg execution finished', {
          code,
          signal,
          success: code === 0,
          stdout: stdout.trim() || undefined,
          stderrTail: stderr.split('\n').filter(line => line.trim()).slice(-8).join('\n') || undefined
        })
        
        if (code !== 0) {
          console.error(`[FFmpegExecutor] FFmpeg process failed with exit code: ${code}`)
          
          // 分析错误原因
          errorReason = this.analyzeFFmpegError(stderr)
          console.error(`[FFmpegExecutor] Error reason: ${errorReason}`)
          appLogger.error('FFmpeg process failed', {
            code,
            signal,
            errorReason,
            stderrTail: stderr.split('\n').filter(line => line.trim()).slice(-5)
          })
          
          // 输出错误信息的最后几行
          const stderrLines = stderr.split('\n').filter(line => line.trim())
          if (stderrLines.length > 0) {
            console.error(`[FFmpegExecutor] Last error lines:`)
            stderrLines.slice(-5).forEach(line => {
              console.error(`[FFmpegExecutor]   ${line}`)
            })
          }
        } else {
          console.log(`[FFmpegExecutor] FFmpeg process completed successfully`)
          appLogger.info('FFmpeg process completed successfully', { code, signal })
        }
        
        resolve({
          success: code === 0,
          code,
          signal,
          stdout,
          stderr,
          errorReason
        })

      })

      proc.on("error", (err) => {
        // 清除超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        
        console.error(`[FFmpegExecutor] Process error: ${err.message}`)
        appLogger.error('FFmpeg process error', { message: err.message })
        
        // 检查是否为 NodeJS 系统错误
        if (err instanceof Error) {
          const nodeError = err as NodeJS.ErrnoException
          if (nodeError.code) {
            console.error(`[FFmpegExecutor] Error code: ${nodeError.code}`)
          }
          if (nodeError.path) {
            console.error(`[FFmpegExecutor] Error path: ${nodeError.path}`)
          }
        }
        
        reject(err)
      })

    })

    return {
      process: proc,
      cancel: () => {
        console.log(`[FFmpegExecutor] Cancelling FFmpeg process (PID: ${this.currentPid})`)
        
        if (!this.currentPid) {
          console.warn(`[FFmpegExecutor] No process ID recorded, falling back to proc.kill()`)
          proc.kill("SIGTERM")
          return
        }

        // 根据平台选择适当的kill命令
        const isWindows = process.platform === "win32"
        const killCommand = isWindows ? "taskkill" : "kill"
        const killArgs = isWindows 
          ? ["/PID", this.currentPid.toString(), "/F"]
          : ["-9", this.currentPid.toString()]

        console.log(`[FFmpegExecutor] Executing: ${killCommand} ${killArgs.join(" ")}`)

        const killProc = spawn(killCommand, killArgs)
        
        killProc.on("close", (code) => {
          if (code === 0) {
            console.log(`[FFmpegExecutor] Successfully terminated process ${this.currentPid}`)
          } else {
            console.warn(`[FFmpegExecutor] kill command exited with code ${code}, falling back to proc.kill()`)
            proc.kill("SIGTERM")
          }
          this.currentPid = undefined
        })

        killProc.on("error", (err) => {
          console.error(`[FFmpegExecutor] kill command error: ${err.message}, falling back to proc.kill()`)
          proc.kill("SIGTERM")
          this.currentPid = undefined
        })
      },
      result
    }

  }

}
