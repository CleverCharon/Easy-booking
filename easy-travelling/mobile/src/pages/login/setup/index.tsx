import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Input, Toast } from '@nutui/nutui-react-taro'
import { ArrowLeft, Check, Eye, EyeInvisible } from '@nutui/icons-react-taro' // 增加 Eye 图标用于密码可见性切换（可选，先保留基础）
import { useUserStore } from '../../../store/user'
import { post } from '../../../utils/request'
import './index.scss'

/**
 * 账号设置页面
 * 允许新用户在通过短信验证后设置用户名和登录密码。
 */
const SetupAccount = () => {
  const router = useRouter()
  const { userId, phone } = router.params
  const { login } = useUserStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')

  /**
   * 处理账号设置提交
   */
  const handleSetup = async () => {
    if (!username) {
      Toast.show('请输入账号')
      return
    }
    if (!password) {
      Toast.show('请输入密码')
      return
    }
    if (password !== confirmPwd) {
      Toast.show('两次密码不一致')
      return
    }

    try {
      const res = await post('/user/setup-account', {
        userId: Number(userId),
        username,
        password
      })

      if (res.success) {
        Toast.show({ content: '设置成功', icon: 'success' })
        
        // 更新全局用户状态
        login(res.user)
        
        // 延迟跳转以保证提示框可见
        setTimeout(() => {
          // 回退两步以返回登录前的页面
          // 流程: 来源页 -> 登录页 -> 设置页 -> (回退2步) -> 来源页
          Taro.navigateBack({ delta: 2 })
        }, 1500)
      } else {
        // 如果未被拦截器捕获，则作为兜底处理
        if (!res.message || (!res.message.includes('账号') && !res.message.includes('密码'))) {
          Toast.show(res.message || '设置失败')
        }
      }
    } catch (e: any) {
      console.error(e)
      // 避免重复提示
      if (!e.message || (!e.message.includes('账号') && !e.message.includes('密码'))) {
        Toast.show(e.message || '系统异常')
      }
    }
  }

  return (
    <View className="setup-page">
      {/* 背景图，保持与登录页一致或使用协调的图片 */}
      <Image 
        src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80" 
        className="bg-img" 
        mode="aspectFill" 
      />
      <View className="overlay" />
      <View className="gradient-overlay" />

      <View className="nav-bar">
        <View className="back-btn" onClick={() => Taro.navigateBack()}>
          <ArrowLeft color="#fff" size={20} />
        </View>
        <Text className="title">完善资料</Text>
      </View>

      <View className="content-wrap">
        <View className="header-sec">
          <Text className="main-tit">欢迎加入易宿</Text>
          <Text className="sub-tit">请设置您的专属账号与密码</Text>
        </View>

        <View className="form-card">
          <View className="phone-info">
            <Text className="label">当前绑定手机</Text>
            <Text className="value">{phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</Text>
          </View>

          <View className="input-group">
            <Input
              className="custom-input"
              placeholder="请设置用户名 (2-10位字符)"
              value={username}
              onChange={(val) => setUsername(val)}
              clearable
            />
          </View>
          
          <View className="input-group">
            <Input
              className="custom-input"
              placeholder="请设置登录密码 (6-20位)"
              type="password"
              value={password}
              onChange={(val) => setPassword(val)}
              clearable
            />
          </View>
          
          <View className="input-group">
            <Input
              className="custom-input"
              placeholder="请再次确认密码"
              type="password"
              value={confirmPwd}
              onChange={(val) => setConfirmPwd(val)}
              clearable
            />
          </View>

          <Button className="submit-btn" onClick={handleSetup}>
            开启旅程
          </Button>
        </View>
      </View>
    </View>
  )
}

export default SetupAccount
