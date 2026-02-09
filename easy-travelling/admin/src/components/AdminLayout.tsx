import { Outlet, Navigate } from 'react-router-dom'
import { isLoggedIn } from '../utils/auth'
import { getUser } from '../utils/auth'
import AppHeader from './AppHeader'

/** 仅管理员可访问的布局；非管理员登录后重定向到 /hotels */
export default function AdminLayout() {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  if (getUser()?.role !== 'admin') {
    return <Navigate to="/hotels" replace />
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
