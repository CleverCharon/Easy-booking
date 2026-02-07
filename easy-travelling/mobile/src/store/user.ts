import { create } from 'zustand'

interface UserInfo {
  id: string
  nickname: string
  avatar?: string
  phone?: string
  level?: string
}

interface UserState {
  isLogin: boolean
  userInfo: UserInfo | null
  login: (userInfo: UserInfo) => void
  logout: () => void
}

export const useUserStore = create<UserState>((set) => ({
  isLogin: false,
  userInfo: null,
  login: (userInfo) => set({ isLogin: true, userInfo }),
  logout: () => set({ isLogin: false, userInfo: null }),
}))
