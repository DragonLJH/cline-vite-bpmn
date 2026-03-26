import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { generateRoutes, getNavigationItems } from '../../router'

const Navigation: React.FC = () => {
  const location = useLocation()

  // 从路由系统获取导航项
  const routes = generateRoutes()
  const navItems = getNavigationItems(routes)

  return (
    <nav className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white py-4 px-8 sticky top-0 z-50 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* 品牌区域 */}
        <div>
          <h2 className="m-0 text-2xl font-semibold">
            ⚛️ Vite + React + Electron
          </h2>
          <p className="mt-1 opacity-80 text-sm">
            现代化桌面应用
          </p>
        </div>

        {/* 导航菜单 */}
        <div className="flex gap-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`py-2 px-4 text-white no-underline rounded-md font-medium transition-all duration-200 ${
                location.pathname === item.path ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
              title={item.description}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* 窗口控制按钮 */}
        <div className="flex gap-1">
          <button
            onClick={() => window.electronAPI?.minimizeWindow()}
            className="p-1 bg-white/10 border-0 rounded text-white cursor-pointer text-xs hover:bg-white/20 transition-colors duration-200"
            title="最小化"
          >
            ─
          </button>
          <button
            onClick={() => window.electronAPI?.toggleMaximize()}
            className="p-1 bg-white/10 border-0 rounded text-white cursor-pointer text-xs hover:bg-white/20 transition-colors duration-200"
            title="最大化/还原"
          >
            □
          </button>
          <button
            onClick={() => window.electronAPI?.closeWindow()}
            className="p-1 bg-white/10 border-0 rounded text-red-500 cursor-pointer text-xs hover:bg-red-500 hover:text-white transition-all duration-200"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* 状态指示器 */}
        <div className="flex items-center gap-2 py-2 px-4 bg-white/10 rounded-full">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <span className="text-sm font-medium">
            运行中
          </span>
        </div>
      </div>
    </nav>
  )
}

export default Navigation