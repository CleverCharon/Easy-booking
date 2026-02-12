import React, { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { usePageScroll } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { 
  Order, Star, Service, Setting, Message, Location, 
  User as UserIcon, Right, Check, Clock
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
    { name: '发票报销', icon: <Order /> },
    { name: '积分商城', icon: <Star /> },
    { name: '每日签到', icon: <Check /> },
    { name: '常用旅客', icon: <UserIcon /> },
    { name: '地址管理', icon: <Location /> },
    { name: '客服帮助', icon: <Service /> },
  ]

  const vouchers = [
    { name: '优惠券', count: 5, icon: <Order size={18} color="#2C439B" /> },
    { name: '升房券', count: 2, icon: <Star size={18} color="#2C439B" /> },
    { name: '早餐券', count: 3, icon: <Check size={18} color="#2C439B" /> },
    { name: '延时券', count: 1, icon: <Clock size={18} color="#2C439B" /> },
  ]

  const banners = [
    { title: '降价自动退！买贵我就赔！', desc: '实时监控价格变动', bg: '#e6f7ff' },
    { title: '周末特惠活动', desc: '预订享额外折扣', bg: '#fff0f6' },
    { title: '亲子精选套餐', desc: '家庭出行优惠', bg: '#f0f9ff' },
  ]

  const settings = [
    { name: '常见问题', icon: <Service color="#33C7F7" /> },
    { name: '隐私安全', icon: <Check color="#33C7F7" /> },
    { name: '关于易宿', icon: <Message color="#33C7F7" /> },
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
        <View className="right-icons">
          <Service className="icon" />
          <Message className="icon" />
          <Setting className="icon" />
        </View>
      </View>

      <ScrollView scrollY className="content-scroll">
        {/* User Card */}
        <View className="user-section">
          <View className="user-card" onClick={goLogin}>
            {isLogin ? (
              <View className="logged-in">
                <View className="top-row">
                  <View className="avatar-wrap">
                    <Text className="char">{userInfo?.nickname?.[0] || 'U'}</Text>
                  </View>
                  <View className="info">
                    <Text className="name">{userInfo?.nickname}</Text>
                    <View className="level-tag">
                      <Text className="tag-txt">银卡会员</Text>
                    </View>
                  </View>
                  <Right color="#2C439B" size={14} />
                </View>
                <View className="stats-row">
                  <View className="stat-item">
                    <Text className="num">1280</Text>
                    <Text className="label">积分</Text>
                  </View>
                  <View className="stat-item">
                    <Text className="num">5</Text>
                    <Text className="label">优惠券</Text>
                  </View>
                  <View className="stat-item">
                    <Text className="num">12</Text>
                    <Text className="label">收藏</Text>
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
                  {React.cloneElement(item.icon as any, { color: '#2C439B', size: 20 })}
                </View>
                <Text className="name">{item.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Vouchers */}
        <View className="vouchers-card">
          <View className="head">
            <Text className="tit">我的卡券包</Text>
            <View className="more">
              <Text>查看全部</Text>
              <Right size={10} />
            </View>
          </View>
          <View className="v-grid">
            {vouchers.map((v, i) => (
              <View key={i} className="v-item">
                <View className="icon-bg">{v.icon}</View>
                <Text className="count">{v.count}</Text>
                <Text className="name">{v.name}</Text>
              </View>
            ))}
          </View>
          {!isLogin && (
            <View className="login-tip">
              <Button className="go-btn">去领券</Button>
            </View>
          )}
        </View>

        {/* Banners */}
        <View className="banners-list">
          {banners.map((b, i) => (
            <View key={i} className="banner-item" style={{ background: b.bg }}>
              <View>
                <Text className="tit">{b.title}</Text>
                <Text className="sub">{b.desc}</Text>
              </View>
              <Button className="view-btn">立即查看</Button>
            </View>
          ))}
        </View>

        {/* Settings */}
        <View className="settings-card">
          {settings.map((s, i) => (
            <View key={i} className="row">
              <View className="left">
                {s.icon}
                <Text className="txt">{s.name}</Text>
              </View>
              <Right size={12} color="#ccc" />
            </View>
          ))}
          {isLogin && (
            <View className="row" onClick={handleLogout}>
              <View className="left">
                <Setting color="#33C7F7" />
                <Text className="txt">退出登录</Text>
              </View>
              <Right size={12} color="#ccc" />
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  )
}

export default MyPage
