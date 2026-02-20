import React, { useEffect } from 'react'
import { useDidShow, useDidHide } from '@tarojs/taro'
// 全局样式
import './app.scss'

// 屏蔽 NutUI 或 React 在开发环境下的特定警告
if (process.env.NODE_ENV === 'development') {
  const originalError = console.error
  console.error = (...args) => {
    if (typeof args[0] === 'string') {
      // 忽略旧版组件库常见的 forwardRef 警告
      if (args[0].includes('forwardRef render functions accept exactly two parameters')) return
      // 忽略不支持的样式属性警告
      if (args[0].includes('Unsupported style property') && args.some(arg => typeof arg === 'string' && arg.includes('-webkitMask'))) return
    }
    originalError.apply(console, args)
  }
}

/**
 * 主应用程序组件
 */
function App(props) {
  // 应用程序生命周期钩子
  useEffect(() => {})

  // 当应用程序显示时触发
  useDidShow(() => {})

  // 当应用程序隐藏时触发
  useDidHide(() => {})

  return props.children
}

export default App
