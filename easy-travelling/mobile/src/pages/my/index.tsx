import React, { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { usePageScroll } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { 
  Setting, 
  User as UserIcon, ArrowRight, Order, Star
} from '@nutui/icons-react-taro'
import { useUserStore } from '../../store/user'
import './index.scss'

const MyPage = () => {
  const { isLogin, userInfo, logout } = useUserStore()
  const [scrollTop, setScrollTop] = useState(0)

  usePageScroll((res) => {
    setScrollTop(res.scrollTop)
  })

  const goLogin = () => {
    if (!isLogin) {
      Taro.navigateTo({ url: '/pages/login/index' })
    }
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout()
          Taro.showToast({ title: '已退出', icon: 'none' })
        }
      }
    })
  }

  const menuItems = [
    { name: '酒店订单', icon: <Order />, path: '/pages/order/list/index' },
    { name: '我的收藏', icon: <Star />, path: '/pages/favorite/index', isTab: true },
  ]

  const handleMenuClick = (item: any) => {
    if (item.path) {
      if (item.isTab) {
        Taro.switchTab({ url: item.path })
      } else {
        Taro.navigateTo({ url: item.path })
      }
    }
  }

  return (
    <View className="my-page-v2">
      {/* Navbar */}
      <View 
        className={`nav-bar ${scrollTop > 10 ? 'scrolled' : ''}`}
      >
        <Text className="title">我的</Text>
      </View>

      <ScrollView scrollY className="content-scroll">
        {/* User Card */}
        <View className="user-section">
          <View className="user-card" onClick={goLogin}>
            {isLogin ? (
              <View className="logged-in">
                <View className="top-row">
                  <View className="avatar-wrap">
                    <Text className="char">{userInfo?.username?.[0] || 'U'}</Text>
                  </View>
                  <View className="info">
                    <Text className="name">{userInfo?.username || '用户'}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className="not-login">
                <View className="left">
                  <View className="avatar-placeholder">
                    <UserIcon color="#33C7F7" size={24} />
                  </View>
                  <View className="texts">
                    <Text className="tit">登录 / 注册</Text>
                    <Text className="sub">登录后同步订单、收藏与优惠券</Text>
                  </View>
                </View>
                <Button className="login-btn">去登录</Button>
              </View>
            )}
          </View>
        </View>

        {/* Benefits Banner */}
        <View className="benefits-card">
          <View className="tag">限时</View>
          <View className="content">
            <View>
              <Text className="tit">入会新人礼</Text>
              <Text className="sub">领券立减 · 会员价 · 延迟退房</Text>
            </View>
            <Button className="get-btn">立即领取</Button>
          </View>
        </View>

        {/* Function Grid */}
        <View className="grid-card">
          <View className="grid-box">
            {menuItems.map((item, i) => (
              <View key={i} className="grid-item" onClick={() => handleMenuClick(item)}>
                <View className="icon-box">
                  {React.cloneElement(item.icon as any, { color: '#2C439B', size: 24 })}
                </View>
                <Text className="name">{item.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        {isLogin && (
          <View className="settings-card">
            <View className="row" onClick={handleLogout}>
              <View className="left">
                <Setting color="#33C7F7" />
                <Text className="txt">退出登录</Text>
              </View>
              <ArrowRight size={12} color="#ccc" />
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  )
}

export default MyPage
