import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { RouteConfig } from '../../router'

interface AppTopProps {
  routes?: RouteConfig[]
}

const AppTop: React.FC<AppTopProps> = ({ routes = [] }) => {
  const location = useLocation()
  const [isMaximized, setIsMaximized] = useState(false)
  const [platform, setPlatform] = useState<string>('')

  // 从路由配置生成导航项
  const navItems = routes.map(route => ({
    path: route.path,
    label: route.meta?.icon ? `${route.meta.icon} ${route.meta.title}` : route.meta?.title || '未命名',
    description: route.meta?.description || ''
  }))

  useEffect(() => {
    // 获取平台信息
    if (window.electronAPI) {
      setPlatform(window.electronAPI.platform)
    }

    // 监听窗口最大化状态变化
    const handleMaximized = () => setIsMaximized(true)
    const handleUnmaximized = () => setIsMaximized(false)

    if (window.electronAPI) {
      window.electronAPI.on('window:maximized', handleMaximized)
      window.electronAPI.on('window:unmaximized', handleUnmaximized)
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.off('window:maximized', handleMaximized)
        window.electronAPI.off('window:unmaximized', handleUnmaximized)
      }
    }
  }, [])

  const handleMinimize = () => {
    if (window.electronAPI) {
      try {
        window.electronAPI.minimizeWindow()
      } catch (error) {
        console.error('Failed to minimize window:', error)
      }
    } else {
      console.error('electronAPI not available')
    }
  }

  const handleMaximize = () => {
    if (window.electronAPI) {
      try {
        window.electronAPI.toggleMaximize()
      } catch (error) {
        console.error('Failed to toggle maximize:', error)
      }
    } else {
      console.error('electronAPI not available')
    }
  }

  const handleClose = () => {
    if (window.electronAPI) {
      try {
        window.electronAPI.closeWindow()
      } catch (error) {
        console.error('Failed to close window:', error)
      }
    } else {
      console.error('electronAPI not available')
    }
  }

  // 根据平台决定是否显示窗口控制按钮
  const showWindowControls = platform === 'win32'

  return (
    <div
      className={`w-[260px] h-screen bg-gradient-to-b from-[#667eea] to-[#764ba2] text-white flex flex-col relative select-none flex-shrink-0 ${
        platform === 'win32' ? 'cursor-default' : ''
      }`}
    >
      {/* 顶部：品牌信息 */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-xl">
            ⚛️
          </div>
          <div>
            <div className="text-base font-semibold leading-tight">
              Vite + React
            </div>
            <div className="text-xs opacity-80 leading-tight">
              + Electron
            </div>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <div className="mb-4">
          <div className="text-xs font-medium opacity-70 mb-2 pl-3 uppercase tracking-wider">
            页面导航
          </div>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center py-2.5 px-3 text-white no-underline rounded-lg text-sm font-medium mb-1 transition-all duration-200 ${
                location.pathname === item.path ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
              title={item.description}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* 底部：状态和控制 */}
      <div className="p-4 border-t border-white/10">
        {/* 状态指示器 */}
        <div className="flex items-center gap-2 mb-3 py-2 px-3 bg-white/10 rounded-lg">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <span className="text-xs font-medium">
            运行中
          </span>
          {window.electronAPI?.appInfo.isDev && (
            <span className="ml-auto py-0.5 px-1.5 bg-white/20 rounded text-[10px] font-medium">
              DEV
            </span>
          )}
        </div>

        {/* 平台信息 */}
        <div className="text-xs opacity-70 mb-3 pl-1">
          {platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform}
        </div>

        {/* 窗口控制按钮（仅 Windows） */}
        {showWindowControls && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleMinimize}
              className="flex-1 h-8 bg-white/10 border-0 text-white cursor-pointer flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-200 hover:bg-white/20"
              title="最小化"
            >
              ─
            </button>
            <button
              onClick={handleMaximize}
              className="flex-1 h-8 bg-white/10 border-0 text-white cursor-pointer flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-200 hover:bg-white/20"
              title={isMaximized ? '还原' : '最大化'}
            >
              {isMaximized ? '❐' : '□'}
            </button>
            <button
              onClick={handleClose}
              className="flex-1 h-8 bg-white/10 border-0 text-red-500 cursor-pointer flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 hover:bg-red-500 hover:text-white"
              title="关闭"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AppTop