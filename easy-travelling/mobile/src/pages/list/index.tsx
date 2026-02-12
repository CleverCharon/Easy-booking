import React, { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Search, Heart, HeartFill, StarFill, Location, Close } from '@nutui/icons-react-taro'
import { Button, Skeleton, Tag, Popup, Checkbox, Rate } from '@nutui/nutui-react-taro'
import { useSearchStore } from '../../store/search'
import { useFavoriteStore, Hotel } from '../../store/favorite'
import { get } from '../../utils/request'
import './index.scss'

const ListPage = () => {
  const { 
    city, startDate, endDate, keyword, setKeyword,
    minPrice, maxPrice, starLevels, setPriceRange, setStarLevels
  } = useSearchStore()
  const { isFavorite, addFavorite, removeFavorite } = useFavoriteStore()
  const [list, setList] = useState<Hotel[]>([])
  const [filteredList, setFilteredList] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])

  // Local filter state for popup
  const [localMinPrice, setLocalMinPrice] = useState(0)
  const [localMaxPrice, setLocalMaxPrice] = useState(10000)
  const [localStars, setLocalStars] = useState<string[]>([])

  // Fetch Data
  useEffect(() => {
    const fetchHotels = async () => {
      setLoading(true)
      try {
        const res = await get(`/hotels?city_name=${city}`)
        
        const hotelList = res.map((h: any) => ({
          id: String(h.id),
          name: h.name,
          image: h.main_image || 'https://via.placeholder.com/300',
          score: Number(h.score),
          price: Number(h.min_price),
          tags: h.brand ? [h.brand] : [],
          location: '距离市中心',
          star: Number(h.star_level) || 3
        }))
        setList(hotelList)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchHotels()
  }, [city])

  // Filter Logic
  useEffect(() => {
    let res = list

    // 1. Keyword filter
    if (keyword) {
      res = res.filter(h => h.name.includes(keyword) || h.tags.includes(keyword))
    }

    // 2. Price filter
    if (maxPrice < 10000 || minPrice > 0) {
      res = res.filter(h => h.price >= minPrice && h.price <= maxPrice)
    }

    // 3. Star filter
    if (starLevels.length > 0) {
      // Map string levels to numbers
      // ['二星/经济', '三星/舒适', '四星/高档', '五星/豪华']
      const targetStars: number[] = []
      if (starLevels.includes('二星/经济')) targetStars.push(2)
      if (starLevels.includes('三星/舒适')) targetStars.push(3)
      if (starLevels.includes('四星/高档')) targetStars.push(4)
      if (starLevels.includes('五星/豪华')) targetStars.push(5)
      
      if (targetStars.length > 0) {
        res = res.filter(h => h.star && targetStars.includes(h.star))
      }
    }

    // 4. Chip filters (simple implementation)
    if (selectedFilters.length > 0) {
      // Example: '含早餐' -> check tags or just ignore for now if data missing
      // For demo, we just simulate filtering if tag matches
      // res = res.filter(...)
    }

    setFilteredList(res)
  }, [list, keyword, minPrice, maxPrice, starLevels, selectedFilters])

  const openFilter = () => {
    setLocalMinPrice(minPrice)
    setLocalMaxPrice(maxPrice)
    setLocalStars(starLevels)
    setShowFilter(true)
  }

  const applyFilter = () => {
    setPriceRange(localMinPrice, localMaxPrice)
    setStarLevels(localStars)
    setShowFilter(false)
  }

  const resetFilter = () => {
    setLocalMinPrice(0)
    setLocalMaxPrice(10000)
    setLocalStars([])
  }

  const toggleLocalStar = (star: string) => {
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

  const toggleFav = (e: any, hotel: Hotel) => {
    e.stopPropagation()
    if (isFavorite(hotel.id)) {
      removeFavorite(hotel.id)
    } else {
      addFavorite(hotel)
    }
  }

  const goDetail = (id: string) => {
    console.log('Navigating to detail:', id)
    Taro.navigateTo({
      url: `/pages/detail/index?id=${id}`,
      fail: (err) => {
        console.error('Navigate failed:', err)
        // Fallback if navigateTo fails (e.g. if mistakenly treated as tabbar page)
        Taro.switchTab({ url: `/pages/detail/index` }).catch(() => {})
      }
    })
  }

  const toggleChip = (chip: string) => {
    if (selectedFilters.includes(chip)) {
      setSelectedFilters(selectedFilters.filter(f => f !== chip))
    } else {
      setSelectedFilters([...selectedFilters, chip])
    }
  }

  const chips = ['2人', '房屋等级', '今夜特价', '免费取消', '自助入住', '近地铁', '可停车', '含早餐']

  return (
    <View className="list-page-v2">
      {/* Top Search Bar */}
      <View className="list-header">
        <View className="search-summary">
          <View className="row1">
            <Text>{city} ▾</Text>
            <Text className="date">{startDate.slice(5)} - {endDate.slice(5)}</Text>
            <Text className="nights">共1晚</Text>
          </View>
          <View className="input-wrap">
             <Search size={12} color="#999" className="icon" />
             <Input
               className="search-input"
               placeholder="位置/民宿名/编号"
               placeholderClass="placeholder"
               value={keyword}
               onInput={(e) => setKeyword(e.detail.value)}
             />
          </View>
        </View>
        <View className="map-btn"><Location size={20} color="#25255F" /></View>
      </View>

      {/* Filter Bar */}
      <View className="filter-bar">
        {['位置/距离', '价格/等级', '人数/床数', '筛选/排序'].map((f, i) => (
          <View key={i} className="filter-item" onClick={openFilter}>
            <Text>{f}</Text>
          </View>
        ))}
      </View>

      {/* Chips */}
      <ScrollView scrollX className="chips-scroll" showScrollbar={false}>
        <View className="chips-flex">
          {chips.map((chip, i) => (
            <View 
              key={i} 
              className={`chip-item ${selectedFilters.includes(chip) ? 'active' : ''}`}
              onClick={() => toggleChip(chip)}
            >
              {chip}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Hotel List */}
      <ScrollView scrollY className="hotel-list">
        {loading ? (
          <View className="skeleton-list">
            {[1, 2, 3].map(i => (
              <View key={i} className="sk-card">
                <Skeleton width="100%" height="160px" title animated row={3} />
              </View>
            ))}
          </View>
        ) : (
          filteredList.map(hotel => (
            <View key={hotel.id} className="hotel-card" onClick={() => goDetail(hotel.id)}>
              <View className="img-wrapper">
                <Image src={hotel.image} className="hotel-img" mode="aspectFill" />
                <View className="badge">限时特价</View>
                <View className="fav-btn" onClick={(e) => toggleFav(e, hotel)}>
                  {isFavorite(hotel.id) ? <HeartFill color="#DFA0C8" /> : <Heart color="#ccc" />}
                </View>
              </View>
              
              <View className="card-info">
                <View className="name-row">
                  <Text className="name">{hotel.name}</Text>
                  <View className="score-box">
                    <Text className="score">{hotel.score}</Text>
                    <StarFill color="#33C7F7" size={10} />
                  </View>
                </View>
                <Text className="distance">{hotel.location}</Text>
                
                <View className="tags">
                  {hotel.tags.map((t, idx) => <Text key={idx} className="tag">{t}</Text>)}
                </View>
                
                <View className="price-row">
                  <View className="price-left">
                    <Text className="symbol">¥</Text>
                    <Text className="price">{hotel.price}</Text>
                    <Text className="origin">¥{Math.floor(hotel.price * 1.2)}</Text>
                    <Text className="save">已省¥{Math.floor(hotel.price * 0.2)}</Text>
                  </View>
                  <Button size="small" className="book-btn" onClick={(e) => { e.stopPropagation(); goDetail(hotel.id) }}>预订</Button>
                </View>
              </View>
            </View>
          ))
        )}
        {!loading && <View className="no-more">没有更多了</View>}
      </ScrollView>

      {/* Filter Popup */}
      <Popup visible={showFilter} position="bottom" onClose={() => setShowFilter(false)} round style={{ height: '60%' }}>
        <View className="filter-popup">
          <View className="popup-header">
            <Text className="title">筛选条件</Text>
            <Close size={18} onClick={() => setShowFilter(false)} />
          </View>
          <ScrollView scrollY className="popup-body">
             <View className="section">
               <Text className="label">星级</Text>
               <View className="stars">
                 {starOptions.map(star => (
                   <View 
                     key={star} 
                     className={`star-opt ${localStars.includes(star) ? 'active' : ''}`}
                     onClick={() => toggleLocalStar(star)}
                   >
                     {star}
                   </View>
                 ))}
               </View>
             </View>
             <View className="section">
               <Text className="label">价格区间</Text>
               <View className="price-opts">
                 {priceOptions.map((p, i) => {
                   const isActive = localMinPrice === p.min && localMaxPrice === p.max
                   return (
                     <View 
                       key={i} 
                       className={`opt-item ${isActive ? 'active' : ''}`}
                       onClick={() => {
                         setLocalMinPrice(p.min)
                         setLocalMaxPrice(p.max)
                       }}
                     >
                       {p.label}
                     </View>
                   )
                 })}
               </View>
             </View>
          </ScrollView>
          <View className="popup-footer">
            <Button className="reset-btn" onClick={resetFilter}>重置</Button>
            <Button className="confirm-btn" type="primary" onClick={applyFilter}>
              查看{filteredList.length}家
            </Button>
          </View>
        </View>
      </Popup>
    </View>
  )
}

export default ListPage
