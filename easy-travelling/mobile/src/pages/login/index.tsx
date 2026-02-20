import React, { useState, useEffect } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button, Input, Toast } from '@nutui/nutui-react-taro'
import { Close, Check } from '@nutui/icons-react-taro'
import { useUserStore } from '../../store/user'
import { post } from '../../utils/request'
import './index.scss'

/**
 * 登录页面组件
 * 处理用户认证逻辑，支持短信验证码和密码两种方式。
 * 在小程序环境下支持微信一键登录。
 */
const LoginPage = () => {
  const { login } = useUserStore()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<'code' | 'password'>('code')
  const [countdown, setCountdown] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [isWeapp, setIsWeapp] = useState(false)

  useEffect(() => {
    // 检查是否运行在微信小程序环境
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      setIsWeapp(true)
    }
  }, [])

  /**
   * 请求发送短信验证码
   */
  const handleGetCode = async () => {
    if (phone && phone.length === 11) {
      try {
        await post('/sms/send', { phone })
        setCountdown(60)
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)
        Toast.show('验证码已发送')
      } catch (e: any) {
        // 错误通常由 request.ts 拦截器统一处理
      }
    } else {
      Toast.show('请输入正确的手机号')
    }
  }

  /**
   * 处理登录提交逻辑
   */
  const handleLogin = async () => {
    if (!agreed) {
      Toast.show('请先阅读并同意协议')
      return
    }
    if (!phone) {
      Toast.show('请输入手机号')
      return
    }
    if (loginMethod === 'code' && !code) {
      Toast.show('请输入验证码')
      return
    }
    if (loginMethod === 'password' && !password) {
      Toast.show('请输入密码')
      return
    }

    try {
      const res = await post('/user/login', { phone, code, password, method: loginMethod })
      
      // 如果后端返回新用户标识，则重定向至账号设置页
      if (res.is_new) {
        Toast.show('请设置账号密码')
        setTimeout(() => {
          Taro.navigateTo({ url: `/pages/login/setup/index?userId=${res.id}&phone=${res.phone}` })
        }, 1000)
        return
      }

      if (res && res.id) {
        login(res)
        Toast.show({ content: '登录成功', icon: 'success' })
        setTimeout(() => {
          Taro.navigateBack()
        }, 1000)
      } else {
        Toast.show('登录失败')
      }
    } catch (e: any) {
      console.error(e)
      // 仅当特定业务错误未被处理时显示通用提示
      if (!e.message || !e.message.includes('密码')) {
         Toast.show(e.message || '登录异常')
      }
    }
  }

  /**
   * 处理微信登录 (仅限小程序)
   */
  const handleWechatLogin = async () => {
    if (!agreed) {
      Toast.show('请先阅读并同意协议')
      return
    }

    try {
      const loginRes = await Taro.login()
      if (loginRes.code) {
        // 通过后端交换 code 获取 token
        const res = await post('/user/wx-login', { code: loginRes.code })
        if (res.token) {
          login(res.userInfo)
          Toast.show({ content: '微信登录成功', icon: 'success' })
          setTimeout(() => {
            Taro.navigateBack()
          }, 1000)
        }
      } else {
        Toast.show('微信登录失败')
      }
    } catch (e) {
      console.error(e)
      Toast.show('微信登录异常')
    }
  }

  return (
    <View className="login-page-v2">
      {/* Background */}
      <Image 
        src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80" 
        className="bg-img" 
        mode="aspectFill" 
      />
      <View className="overlay" />
      <View className="gradient-overlay" />

      {/* Top Nav */}
      <View className="top-nav">
        <View className="close-btn" onClick={() => Taro.navigateBack()}>
          <Close color="#fff" size={20} />
        </View>
        <Text className="help-txt">帮助</Text>
      </View>

      {/* Content */}
      <View className="content-wrap">
        <View className="title-sec">
          <Text className="main-tit">不期而遇的温暖</Text>
          <Text className="sub-tit">价格透明 · 官方直连 · 住得放心</Text>
        </View>

        <View className="form-card">
          <View className="method-tabs">
            <View 
                className={`tab ${loginMethod === 'code' ? 'active' : ''}`}
                onClick={() => setLoginMethod('code')}
              >
                验证码登录/注册
              </View>
            <View 
              className={`tab ${loginMethod === 'password' ? 'active' : ''}`}
              onClick={() => setLoginMethod('password')}
            >
              密码登录
            </View>
          </View>

          <View className="input-group">
            <Input 
              className="custom-input"
              placeholder="请输入您的手机号码"
              value={phone}
              onChange={(val) => setPhone(val)}
              type="number"
              maxLength={11}
            />
            {phone && (
              <View className="clear-icon" onClick={() => setPhone('')}>
                <Close size={12} color="#fff" />
              </View>
            )}
          </View>

          {loginMethod === 'code' ? (
            <View className="input-group">
              <Input 
                className="custom-input"
                placeholder="请输入验证码"
                value={code}
                onChange={(val) => setCode(val)}
                type="number"
                maxLength={6}
              />
              <View 
                className={`code-btn ${(!phone || countdown > 0) ? 'disabled' : ''}`}
                onClick={handleGetCode}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </View>
            </View>
          ) : (
            <View className="input-group">
              <Input 
                className="custom-input"
                placeholder="请输入密码"
                value={password}
                onChange={(val) => setPassword(val)}
                type="password"
              />
              <Text className="forget-btn">忘记密码？</Text>
            </View>
          )}

          <Button className="submit-btn" onClick={handleLogin}>
            {loginMethod === 'code' ? '登录 / 注册' : '登录'}
          </Button>

          {loginMethod === 'password' && (
            <View className="switch-method" onClick={() => setLoginMethod('code')}>
              <Text>没有账号？去注册</Text>
            </View>
          )}
          
          {isWeapp && (
            <Button 
              className="wx-login-btn" 
              type="success" 
              onClick={handleWechatLogin}
              style={{ marginTop: '10px', width: '100%' }}
            >
              微信一键登录
            </Button>
          )}
          
          <View className="guest-link">
            <Text onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>游客浏览</Text>
          </View>
        </View>

        <View className="agreement">
          <View className="checkbox" onClick={() => setAgreed(!agreed)}>
            {agreed ? <Check size={10} color="#33C7F7" /> : null}
          </View>
          <Text className="text">
            我已阅读并同意 <Text className="link">《用户协议》</Text> <Text className="link">《隐私条款》</Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

export default LoginPage
