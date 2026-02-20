import { create } from 'zustand'

/**
 * 用户信息接口定义
 */
interface UserInfo {
  id: string
  nickname: string
  avatar?: string
  phone?: string
  level?: string
  username?: string
}

/**
 * 用户状态存储接口定义
 */
interface UserState {
  isLogin: boolean
  userInfo: UserInfo | null
  /**
   * 用户登录并更新状态
   * @param userInfo - 用户信息对象
   */
  login: (userInfo: UserInfo) => void
  /**
   * 用户登出并清除状态
   */
  logout: () => void
}

/**
 * 全局用户状态管理 (基于 Zustand)
 */
export const useUserStore = create<UserState>((set) => ({
  isLogin: false,
  userInfo: null,
  login: (userInfo) => set({ isLogin: true, userInfo }),
  logout: () => set({ isLogin: false, userInfo: null }),
}))
