import React, { useEffect } from 'react'
import { useDidShow, useDidHide } from '@tarojs/taro'
// 全局样式
import './app.scss'

// 忽略 NutUI 的开发环境警告
if (process.env.NODE_ENV === 'development') {
  const originalError = console.error
  console.error = (...args) => {
    if (typeof args[0] === 'string') {
      if (args[0].includes('forwardRef render functions accept exactly two parameters')) return
      if (args[0].includes('Unsupported style property') && args.some(arg => typeof arg === 'string' && arg.includes('-webkitMask'))) return
    }
    originalError.apply(console, args)
  }
}

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {})

  // 对应 onShow
  useDidShow(() => {})

  // 对应 onHide
  useDidHide(() => {})

  return props.children
}

export default App
