import Taro from '@tarojs/taro'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * 用户信息接口定义
 */
interface UserInfo {
  id: string | number
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

const USER_STORE_KEY = 'easy_travel_user_store'

const taroStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      const value = Taro.getStorageSync(name)
      return value || null
    } catch (error) {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      Taro.setStorageSync(name, value)
    } catch (error) {}
  },
  removeItem: (name: string) => {
    try {
      Taro.removeStorageSync(name)
    } catch (error) {}
  },
}))

/**
 * 全局用户状态管理 (基于 Zustand + 持久化)
 */
export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      isLogin: false,
      userInfo: null,
      login: (userInfo) => set({ isLogin: true, userInfo }),
      logout: () => set({ isLogin: false, userInfo: null }),
    }),
    {
      name: USER_STORE_KEY,
      storage: taroStorage,
      partialize: (state) => ({
        isLogin: state.isLogin,
        userInfo: state.userInfo,
      }),
    }
  )
)
