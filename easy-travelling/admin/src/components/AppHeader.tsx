import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { getUser, clearAuth } from '../utils/auth'
import { toast } from '../utils/toast'

/**
 * 登录后所有页面顶部显示的 Header，不遮挡内容（正常文档流）
 */
export default function AppHeader() {
  const navigate = useNavigate()
  const user = getUser()

  const handleLogout = () => {
    clearAuth()
    toast.success('已退出登录')
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <header className="bg-white border-b border-gray-200/80 shadow-sm shrink-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        <span className="text-gray-700 font-medium">
          欢迎，<span className="text-[#2c4fa3] font-semibold">{user.username}</span>
        </span>
        <Button
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          className="text-gray-600 hover:text-red-600 font-medium"
        >
          退出登录
        </Button>
      </div>
    </header>
  )
}
