import React, { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { 
  Notice, 
  User as UserIcon, 
  Location, 
  Search, 
  Close, 
  ArrowRight,
  Coupon,
  Cart,
  Heart,
  Order
} from '@nutui/icons-react-taro'
import { Button, Swiper, SwiperItem, Toast, Calendar, Picker, Popup, InputNumber } from '@nutui/nutui-react-taro'
import dayjs from 'dayjs'
import { useSearchStore } from '../../store/search'
import './index.scss'

const HomePage = () => {
  const { city, startDate, endDate, setCity, setDates, keyword, setKeyword, adults, children, setPeople } = useSearchStore()
  const [selectedTab, setSelectedTab] = useState('国内')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  
  // Visibility States
  const [isCalendarVisible, setIsCalendarVisible] = useState(false)
  const [isCityVisible, setIsCityVisible] = useState(false)
  const [isGuestVisible, setIsGuestVisible] = useState(false)

  const tabs = ['国内', '海外', '钟点房', '民宿']
  const quickTags = ['亲子', '豪华', '免费停车', '海景', '温泉', '宠物友好', '情侣', '商务']
  const cityList = [
    { text: '广州', value: '广州' },
    { text: '北京', value: '北京' },
    { text: '上海', value: '上海' },
    { text: '深圳', value: '深圳' },
    { text: '杭州', value: '杭州' },
    { text: '成都', value: '成都' },
    { text: '三亚', value: '三亚' },
  ]
  
  const quickAccess = [
    { name: '优惠中心', icon: <Coupon color="#2C439B" size={20} /> },
    { name: '特价酒店', icon: <Cart color="#2C439B" size={20} /> },
    { name: '收藏降价', icon: <Heart color="#2C439B" size={20} /> },
    { name: '我的订单', icon: <Order color="#2C439B" size={20} />, path: '/pages/order/list/index' }
  ]

  const bannerImages = [
    'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg',
    'https://img10.360buyimg.com/ling/jfs/t1/198797/16/32777/94747/67a57c5aF73351989/65d95393132e4d0d.jpg',
    'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg'
  ]

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  const handleSearch = () => {
    Taro.switchTab({ url: '/pages/list/index' })
  }

  const handleQuickAccess = (item: any) => {
    if (item.path) {
      Taro.navigateTo({ url: item.path })
    } else {
      Toast.show(`${item.name} 功能开发中`)
    }
  }

  const confirmDate = (param: any) => {
    if (param && param.length >= 2) {
      // NutUI Calendar returns [start, end]
      // param[0] is start date object, param[1] is end date object
      // param[0][3] is the date string 'YYYY-MM-DD'
      const start = param[0][3]
      const end = param[1][3]
      setDates(start, end)
    }
    setIsCalendarVisible(false)
  }

  const confirmCity = (options: any[]) => {
    setCity(options[0].text)
    setIsCityVisible(false)
  }

  const confirmGuest = () => {
    setIsGuestVisible(false)
  }

  const nights = dayjs(endDate).diff(dayjs(startDate), 'day')
  const startStr = dayjs(startDate).format('MM月DD日')
  const endStr = dayjs(endDate).format('MM月DD日')

  // Helper to determine day text (Today/Tomorrow)
  const getDayText = (date: string) => {
    const today = dayjs().format('YYYY-MM-DD')
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
    if (date === today) return '今天'
    if (date === tomorrow) return '明天'
    return dayjs(date).format('ddd')
  }

  return (
    <View className="home-page-v2">
      {/* Top Navigation */}
      <View className="top-nav">
        <View className="brand">易宿</View>
        <View className="icons">
          <Notice color="#fff" size={20} />
          <UserIcon color="#fff" size={20} onClick={() => Taro.switchTab({ url: '/pages/my/index' })} />
        </View>
      </View>

      {/* Banner */}
      <View className="banner-container">
        <Swiper height={220} autoPlay paginationVisible loop>
          {bannerImages.map((img, idx) => (
            <SwiperItem key={idx}>
              <Image src={img} mode="aspectFill" className="banner-img" />
            </SwiperItem>
          ))}
        </Swiper>
        <View className="banner-overlay" />
        <View className="ad-badge">广告推荐</View>
      </View>

      {/* Search Card */}
      <View className="search-card">
        {/* Tabs */}
        <View className="tabs-row">
          {tabs.map(tab => (
            <View 
              key={tab} 
              className={`tab-item ${selectedTab === tab ? 'active' : ''}`}
              onClick={() => setSelectedTab(tab)}
            >
              <Text className="tab-text">{tab}</Text>
              {selectedTab === tab && <View className="tab-indicator" />}
            </View>
          ))}
        </View>

        {/* City & Location */}
        <View className="location-row">
          <View className="city-box" onClick={() => setIsCityVisible(true)}>
            <Location color="#33C7F7" size={16} />
            <Text className="city-text">{city}</Text>
          </View>
          <View className="locate-btn" onClick={() => Toast.show('定位中...')}>
            <Location color="#33C7F7" size={16} />
            <Text className="text">我的位置</Text>
          </View>
        </View>

        {/* Keyword */}
        <View className="keyword-row">
          <View className="icon"><Search color="#ccc" size={16} /></View>
          <View className="input-box">
             {/* Simple input simulation, can use Input component if needed */}
             <Text className={keyword ? 'val' : 'placeholder'} onClick={() => Toast.show('输入框开发中')}>{keyword || '位置/品牌/酒店'}</Text>
          </View>
          {keyword && <View className="clear" onClick={() => setKeyword('')}><Close size={12} /></View>}
        </View>

        {/* Date Selection */}
        <View className="date-row" onClick={() => setIsCalendarVisible(true)}>
           <View className="date-col">
             <Text className="date-val">{startStr} <Text className="small">{getDayText(startDate)}</Text></Text>
           </View>
           <View className="arrow">
             <ArrowRight size={12} color="#2C439B" />
           </View>
           <View className="date-col">
             <Text className="date-val">{endStr} <Text className="small">{getDayText(endDate)}</Text></Text>
           </View>
           <Text className="nights">共{nights}晚</Text>
        </View>

        {/* Filters */}
        <View className="filter-row" onClick={() => setIsGuestVisible(true)}>
           <Text className="filter-text">1居, {adults}成人, {children}儿童</Text>
           <Text className="filter-text">价格不限 · 星级不限</Text>
        </View>

        {/* Quick Tags */}
        <ScrollView scrollX className="tags-scroll" showScrollbar={false}>
          <View className="tags-flex">
            {quickTags.map(tag => (
              <View 
                key={tag} 
                className={`tag-item ${selectedTags.includes(tag) ? 'selected' : ''}`}
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Search Button */}
        <Button className="search-btn" onClick={handleSearch}>开始搜索</Button>
      </View>

      {/* Quick Access */}
      <View className="quick-access">
        {quickAccess.map((item, idx) => (
          <View key={idx} className="qa-item" onClick={() => handleQuickAccess(item)}>
            <View className="icon-circle">{item.icon}</View>
            <Text className="qa-name">{item.name}</Text>
          </View>
        ))}
      </View>

      {/* Inspiration */}
      <View className="section-container">
        <Text className="section-title">住宿灵感</Text>
        <View className="inspiration-grid">
           <View className="insp-card">
              <Image src="https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg" className="insp-img" mode="aspectFill" />
              <Text className="insp-text">冬日暖屋</Text>
           </View>
           <View className="insp-card">
              <Image src="https://img10.360buyimg.com/ling/jfs/t1/198797/16/32777/94747/67a57c5aF73351989/65d95393132e4d0d.jpg" className="insp-img" mode="aspectFill" />
              <Text className="insp-text">海边度假</Text>
           </View>
        </View>
      </View>

      {/* Promo Banner */}
      <View className="promo-banner">
        <View className="promo-info">
          <Text className="promo-title">新人专享大礼包</Text>
          <Text className="promo-desc">最高可领 ¥1000</Text>
        </View>
        <Button size="small" className="promo-btn">立即领取</Button>
      </View>

      {/* Spacing for TabBar */}
      <View style={{ height: '80px' }} />

      {/* Calendar Popup */}
      <Calendar
        visible={isCalendarVisible}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setIsCalendarVisible(false)}
        onConfirm={confirmDate}
        type="range"
      />

      {/* City Picker */}
      <Picker
        visible={isCityVisible}
        options={cityList}
        onConfirm={confirmCity}
        onClose={() => setIsCityVisible(false)}
      />

      {/* Guest Selection Popup */}
      <Popup 
        visible={isGuestVisible} 
        position="bottom" 
        onClose={() => setIsGuestVisible(false)}
        round
        style={{ height: '40%' }}
      >
        <View className="popup-content">
          <View className="popup-header">
            <Text className="title">入住人数</Text>
            <Close size={18} onClick={() => setIsGuestVisible(false)} />
          </View>
          
          <View className="guest-row">
            <Text className="label">成人</Text>
            <InputNumber 
              min={1} 
              max={10} 
              value={adults} 
              onChange={(val) => setPeople(Number(val), children)} 
            />
          </View>
          
          <View className="guest-row">
            <Text className="label">儿童</Text>
            <InputNumber 
              min={0} 
              max={5} 
              value={children} 
              onChange={(val) => setPeople(adults, Number(val))} 
            />
          </View>

          <Button type="primary" block className="confirm-btn" onClick={confirmGuest}>确定</Button>
        </View>
      </Popup>
    </View>
  )
}

export default HomePage
