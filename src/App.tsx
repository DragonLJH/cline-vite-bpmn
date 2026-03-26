import React, { Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import AppTop from './components/AppTop'
import { generateRoutes, RouteConfig } from './router'
import './App.scss'

// 加载组件
const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
    fontSize: '1.125rem',
    color: '#6b7280'
  }}>
    <div style={{
      width: '24px',
      height: '24px',
      border: '2px solid #e5e7eb',
      borderTop: '2px solid #3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
)

// 路由组件包装器
const RouteWrapper: React.FC<{ route: RouteConfig }> = ({ route }) => {
  const Component = route.component
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Component />
    </Suspense>
  )
}

// 应用根组件
function App() {
  // 使用同步版本的路由生成（包含懒加载）
  const routes = React.useMemo(() => generateRoutes(), [])

  React.useEffect(() => {
    console.log('🎯 路由自动发现完成:', routes.length, '个页面')
  }, [routes])

  return (
    <Router>
      <div className="app" style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'row',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}>
        <AppTop routes={routes} />
        <main className="main-content" style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          margin: 0,
          padding: 0
        }}>
          <Routes>
            {routes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<RouteWrapper route={route} />}
              />
            ))}
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
