import { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { 
  User as UserIcon, 
  Location, 
  Search, 
  Close, 
  ArrowRight
} from '@nutui/icons-react-taro'
import { Button, Swiper, SwiperItem, Calendar, Picker, Popup, InputNumber } from '@nutui/nutui-react-taro'
import dayjs from 'dayjs'
import { useSearchStore } from '../../store/search'
import { get } from '../../utils/request'
import { getLocation } from '../../utils/location'
import { allCities } from '../../utils/city-data'
import './index.scss'

/**
 * 首页组件
 * 展示 Banner、搜索筛选器、快捷入口及推荐内容。
 */
const HomePage = () => {
  const { 
    city, startDate, endDate, setCity, setDates, 
    keyword, setKeyword, 
    adults, children, roomCount, setPeople,
    minPrice, maxPrice, setPriceRange,
    starLevels, setStarLevels
  } = useSearchStore()
  
  const [selectedTab, setSelectedTab] = useState('国内')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [banners, setBanners] = useState<any[]>([])
  const [cityList] = useState<any[]>(allCities)
  const [fullCities, setFullCities] = useState<any[]>([])
  
  // 弹窗可见性状态管理
  const [isCalendarVisible, setIsCalendarVisible] = useState(false)
  const [isCityVisible, setIsCityVisible] = useState(false)
  const [isGuestVisible, setIsGuestVisible] = useState(false)
  const [isPriceStarVisible, setIsPriceStarVisible] = useState(false)

  // 价格/星级筛选的本地临时状态
  const [localMinPrice, setLocalMinPrice] = useState(minPrice)
  const [localMaxPrice, setLocalMaxPrice] = useState(maxPrice)
  const [localStars, setLocalStars] = useState<string[]>(starLevels)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const bannerRes = await get('/banners')
        setBanners(bannerRes)
        
        const cityRes = await get('/cities')
        setFullCities(cityRes)
      } catch (e) {
        console.error('Fetch home data failed', e)
      }
    }
    fetchData()
  }, [])

  /**
   * 处理地理位置定位请求
   */
  const handleLocation = async () => {
    try {
      Taro.showLoading({ title: '定位中...' })
      const cityName = await getLocation(fullCities)
      Taro.hideLoading()
      if (cityName) {
        setCity(cityName)
        Taro.showToast({ title: `已定位到: ${cityName}`, icon: 'success' })
      } else {
        Taro.showToast({ title: '未匹配到附近城市', icon: 'none' })
      }
    } catch (e) {
      Taro.hideLoading()
      console.error(e)
      Taro.showToast({ title: '定位失败，请检查权限', icon: 'none' })
    }
  }

  const tabs = ['国内', '海外', '钟点房', '民宿']
  const quickTags = ['亲子', '豪华', '免费停车', '海景', '温泉', '宠物友好', '情侣', '商务']
  
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

  const confirmDate = (param: any) => {
    if (Array.isArray(param) && param.length === 2) {
      // 处理 NutUI 日历返回的日期格式
      const startVal = param[0][3] || param[0]
      const endVal = param[1][3] || param[1]
      
      setDates(startVal, endVal)
    }
    setIsCalendarVisible(false)
  }

  const confirmCity = (options: any[], values: any[]) => {
    const selected = options?.[0]
    const newVal = selected?.text || selected?.value || values?.[0]
    
    if (newVal) {
      setCity(newVal)
    }
    setIsCityVisible(false)
  }

  const confirmGuest = () => {
    setIsGuestVisible(false)
  }

  const confirmPriceStar = () => {
    setPriceRange(localMinPrice, localMaxPrice)
    setStarLevels(localStars)
    setIsPriceStarVisible(false)
  }

  const handleStarToggle = (star: string) => {
    if (localStars.includes(star)) {
      setLocalStars(localStars.filter(s => s !== star))
    } else {
      setLocalStars([...localStars, star])
    }
  }

  const priceOptions = [
    { label: '不限', min: 0, max: 10000 },
    { label: '¥150以下', min: 0, max: 150 },
    { label: '¥150-300', min: 150, max: 300 },
    { label: '¥300-450', min: 300, max: 450 },
    { label: '¥450-600', min: 450, max: 600 },
    { label: '¥600-1000', min: 600, max: 1000 },
    { label: '¥1000以上', min: 1000, max: 10000 }
  ]

  const starOptions = ['二星/经济', '三星/舒适', '四星/高档', '五星/豪华']

  const getPriceText = () => {
    if (minPrice === 0 && maxPrice >= 10000) return '价格不限'
    if (maxPrice >= 10000) return `¥${minPrice}以上`
    return `¥${minPrice}-${maxPrice}`
  }

  const getStarText = () => {
    if (starLevels.length === 0) return '星级不限'
    if (starLevels.length > 2) return `已选${starLevels.length}项`
    return starLevels.join(',')
  }

  const getNights = () => {
    const start = dayjs(startDate)
    const end = dayjs(endDate)
    const diff = end.diff(start, 'day')
    return diff > 0 ? diff : 1
  }

  const nights = getNights()
  const startStr = dayjs(startDate).format('MM月DD日')
  const endStr = dayjs(endDate).format('MM月DD日')

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
          <UserIcon color="#fff" size={20} onClick={() => Taro.switchTab({ url: '/pages/my/index' })} />
        </View>
      </View>

      {/* Banner */}
      <View className="banner-container">
        {banners.length > 0 && (
          <Swiper height={220} autoPlay loop>
            {banners.map((item, idx) => (
              <SwiperItem key={item.id || idx}>
                <Image src={item.image_url} mode="aspectFill" className="banner-img" />
              </SwiperItem>
            ))}
          </Swiper>
        )}
        <View className="banner-overlay" />
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
          <View className="locate-btn" onClick={handleLocation}>
            <Location color="#33C7F7" size={16} />
            <Text className="text">我的位置</Text>
          </View>
        </View>

        {/* Keyword */}
        <View className="keyword-row">
          <View className="icon">
            <Search color="#ccc" size={16} />
          </View>
          <View className="input-box">
            <Input 
              className="search-input"
              placeholder="位置/品牌/酒店"
              placeholderClass="placeholder"
              value={keyword}
              onInput={(e) => setKeyword(e.detail.value)}
            />
          </View>
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
        <View className="filter-row">
           <View className="filter-item" onClick={() => setIsGuestVisible(true)}>
             <Text className="filter-text">{roomCount}居, {adults}成人, {children}儿童</Text>
           </View>
           <View className="divider" />
           <View className="filter-item" onClick={() => {
             setLocalMinPrice(minPrice)
             setLocalMaxPrice(maxPrice)
             setLocalStars(starLevels)
             setIsPriceStarVisible(true)
           }}>
             <Text className="filter-text">{getPriceText()} · {getStarText()}</Text>
           </View>
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

      {/* Spacing for TabBar */}
      <View style={{ height: '80px' }} />

      {/* Calendar */}
      <Calendar
        visible={isCalendarVisible}
        defaultValue={[startDate, endDate]}
        startDate={dayjs().format('YYYY-MM-DD')}
        type="range"
        onClose={() => setIsCalendarVisible(false)}
        onConfirm={confirmDate}
      />

      {/* City Picker */}
      <Popup 
        visible={isCityVisible} 
        position="bottom" 
        onClose={() => setIsCityVisible(false)}
      >
        <Picker
          visible={true} // Picker is always visible inside the Popup
          options={[cityList]}
          defaultValue={[city]}
          onConfirm={(options, values) => confirmCity(options, values)}
          onClose={() => setIsCityVisible(false)}
          title="选择城市"
        />
      </Popup>

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
            <Text className="label">房间数</Text>
            <InputNumber 
              min={1} 
              max={5} 
              value={roomCount} 
              onChange={(val) => setPeople(adults, children, Number(val))} 
            />
          </View>

          <View className="guest-row">
            <Text className="label">成人</Text>
            <InputNumber 
              min={1} 
              max={10} 
              value={adults} 
              onChange={(val) => setPeople(Number(val), children, roomCount)} 
            />
          </View>
          
          <View className="guest-row">
            <Text className="label">儿童</Text>
            <InputNumber 
              min={0} 
              max={5} 
              value={children} 
              onChange={(val) => setPeople(adults, Number(val), roomCount)} 
            />
          </View>

          <Button type="primary" block className="confirm-btn" onClick={confirmGuest}>确定</Button>
        </View>
      </Popup>

      {/* Price & Star Popup */}
      <Popup 
        visible={isPriceStarVisible} 
        position="bottom" 
        onClose={() => setIsPriceStarVisible(false)}
        round
        style={{ height: '60%' }}
      >
        <View className="popup-content">
          <View className="popup-header">
            <Text className="title">价格星级</Text>
            <Close size={18} onClick={() => setIsPriceStarVisible(false)} />
          </View>
          
          <Text className="section-label">价格范围</Text>
          <View className="price-tags">
            {priceOptions.map((opt, idx) => {
              const isSelected = localMinPrice === opt.min && localMaxPrice === opt.max
              return (
                <View 
                  key={idx} 
                  className={`price-tag ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setLocalMinPrice(opt.min)
                    setLocalMaxPrice(opt.max)
                  }}
                >
                  {opt.label}
                </View>
              )
            })}
          </View>

          <Text className="section-label mt-4">星级要求 (可多选)</Text>
          <View className="star-tags">
            {starOptions.map((star) => (
              <View 
                key={star} 
                className={`star-tag ${localStars.includes(star) ? 'selected' : ''}`}
                onClick={() => handleStarToggle(star)}
              >
                {star}
              </View>
            ))}
          </View>

          <Button type="primary" block className="confirm-btn" onClick={confirmPriceStar}>确定</Button>
        </View>
      </Popup>
    </View>
  )
}

export default HomePage
