import { Outlet, Navigate } from 'react-router-dom'
import { isLoggedIn } from '../utils/auth'
import AppHeader from './AppHeader'

/**
 * 登录后使用的布局：顶部 Header + 下方内容，不遮挡内容
 */
export default function LayoutWithHeader() {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <AppHeader />
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
