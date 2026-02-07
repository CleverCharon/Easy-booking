import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button, Input, Toast } from '@nutui/nutui-react-taro'
import { Close, Check } from '@nutui/icons-react-taro'
import { useUserStore } from '../../store/user'
import './index.scss'

const LoginPage = () => {
  const { login } = useUserStore()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<'code' | 'password'>('code')
  const [countdown, setCountdown] = useState(0)
  const [agreed, setAgreed] = useState(false)

  const handleGetCode = () => {
    if (phone && phone.length === 11) {
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
    } else {
      Toast.show('请输入正确的手机号')
    }
  }

  const handleLogin = () => {
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

    // Mock login
    login({
      id: 'u1',
      nickname: `用户${phone.slice(-4)}`,
      avatar: 'https://img12.360buyimg.com/imagetools/jfs/t1/196430/38/8105/14329/60c806a4Ed506298a/e6de9fb7b8490f38.png',
      phone
    })
    Toast.show({ content: '登录成功', icon: 'success' })
    setTimeout(() => {
      Taro.navigateBack()
    }, 1000)
  }

  return (
    <View className="login-page-v2">
      {/* Background */}
      <Image 
        src="https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg" 
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
              验证码登录
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

          <Button className="submit-btn" onClick={handleLogin}>登录 / 注册</Button>
          
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
