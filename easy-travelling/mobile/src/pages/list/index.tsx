import React, { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Search, Heart, HeartFill, StarFill, Left, Location, Close } from '@nutui/icons-react-taro'
import { Button, Skeleton, Tag, Popup, Checkbox, Rate } from '@nutui/nutui-react-taro'
import { useSearchStore } from '../../store/search'
import { useFavoriteStore, Hotel } from '../../store/favorite'
import './index.scss'

const ListPage = () => {
  const { city, startDate, endDate, keyword, setKeyword } = useSearchStore()
  const { isFavorite, addFavorite, removeFavorite } = useFavoriteStore()
  const [list, setList] = useState<Hotel[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])

  // Mock Data
  useEffect(() => {
    setLoading(true)
    setTimeout(() => {
      const mockHotels: Hotel[] = [
        { 
          id: '1', 
          name: '广州珠江新城豪华公寓', 
          image: 'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg', 
          score: 4.8, 
          price: 598, 
          tags: ['优选民宿', '自助入住', '免费取消'], 
          location: '1.2km' 
        },
        { 
          id: '2', 
          name: '天河商务中心精品酒店', 
          image: 'https://img10.360buyimg.com/ling/jfs/t1/198797/16/32777/94747/67a57c5aF73351989/65d95393132e4d0d.jpg', 
          score: 4.6, 
          price: 428, 
          tags: ['近地铁', '可停车', '含早餐'], 
          location: '0.8km' 
        },
        { 
          id: '3', 
          name: '广州塔附近温馨民宿', 
          image: 'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg', 
          score: 4.7, 
          price: 328, 
          tags: ['免费取消', '自助入住', '近景点'], 
          location: '2.1km' 
        },
        { 
          id: '4', 
          name: '珠江夜景观景酒店', 
          image: 'https://img10.360buyimg.com/ling/jfs/t1/198797/16/32777/94747/67a57c5aF73351989/65d95393132e4d0d.jpg', 
          score: 4.9, 
          price: 798, 
          tags: ['景观房', '含早餐', '免费WiFi'], 
          location: '0.5km' 
        }
      ]
      setList(mockHotels)
      setLoading(false)
    }, 1000)
  }, [])

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
             <Text className="text">{keyword || '位置/民宿名/编号'}</Text>
          </View>
        </View>
        <View className="map-btn"><Location size={20} color="#25255F" /></View>
      </View>

      {/* Filter Bar */}
      <View className="filter-bar">
        {['位置/距离', '价格/等级', '人数/床数', '筛选/排序'].map((f, i) => (
          <View key={i} className="filter-item" onClick={() => setShowFilter(true)}>
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
          list.map(hotel => (
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
                 {[1,2,3,4,5].map(s => <StarFill key={s} color="#33C7F7" size={24} style={{ marginRight: 8 }} />)}
               </View>
             </View>
             <View className="section">
               <Text className="label">价格区间</Text>
               <View className="price-opts">
                 {['不限', '¥100-200', '¥200-400', '¥400以上'].map(p => (
                   <View key={p} className="opt-item">{p}</View>
                 ))}
               </View>
             </View>
          </ScrollView>
          <View className="popup-footer">
            <Button className="reset-btn">重置</Button>
            <Button className="confirm-btn">查看124家</Button>
          </View>
        </View>
      </Popup>
    </View>
  )
}

export default ListPage
