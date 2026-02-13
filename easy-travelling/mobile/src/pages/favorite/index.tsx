import React, { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Toast } from '@nutui/nutui-react-taro'
import { HeartFill, StarFill, Close, ArrowDown, Check } from '@nutui/icons-react-taro'
import { useUserStore } from '../../store/user'
import { get, post } from '../../utils/request'
import './index.scss'

const FavoritePage = () => {
  const { userInfo } = useUserStore()
  const [activeTab, setActiveTab] = useState<'collected' | 'viewed'>('collected')
  const [list, setList] = useState<any[]>([])
  const [isManaging, setIsManaging] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [city, setCity] = useState('全部城市')
  const [sortOption, setSortOption] = useState('最近收藏')

  const fetchData = async () => {
    if (!userInfo?.id) return
    try {
      const endpoint = activeTab === 'collected' ? '/favorites/list' : '/history/list'
      const res = await get(`${endpoint}?user_id=${userInfo.id}`)
      setList(res)
    } catch (e) {
      console.error(e)
    }
  }

  useDidShow(() => {
    if (!userInfo?.id) {
      Toast.show('请先登录')
      // Optional: Redirect to login
      // Taro.navigateTo({ url: '/pages/login/index' })
    } else {
      fetchData()
    }
  })

  useEffect(() => {
    fetchData()
  }, [activeTab, userInfo])

  const toggleSelection = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(item => item !== id))
    } else {
      setSelectedItems([...selectedItems, id])
    }
  }

  const handleManageClick = () => {
    setIsManaging(!isManaging)
    setSelectedItems([])
  }

  const handleCancelCollection = () => {
    if (!userInfo) return
    Taro.showModal({
      title: '提示',
      content: '确定要取消收藏选中的酒店吗？',
      success: async (res) => {
        if (res.confirm) {
          for (const hotelId of selectedItems) {
             await post('/favorites/remove', { user_id: userInfo.id, hotel_id: hotelId })
          }
          fetchData() // Refresh
          setSelectedItems([])
          setIsManaging(false)
          Toast.show('已取消收藏')
        }
      }
    })
  }

  const goDetail = (id: string) => {
    if (isManaging) return
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` })
  }

  if (!userInfo) {
     return (
        <View className="favorite-page-v2 flex flex-col items-center justify-center h-screen bg-white">
           <Text className="mb-4 text-gray-500">请先登录后查看收藏</Text>
           <Button type="primary" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>去登录</Button>
        </View>
     )
  }

  return (
    <View className="favorite-page-v2">
      {/* Top Bar */}
      <View className="top-bar">
        <Text className="title">收藏/看过的房屋</Text>
        {activeTab === 'collected' && (
          <Text className="manage-btn" onClick={handleManageClick}>
            {isManaging ? '完成' : '管理'}
          </Text>
        )}
      </View>

      {/* Custom Tabs */}
      <View className="tabs-container">
        <View className="tabs-wrapper">
          <View 
            className={`tab-item ${activeTab === 'collected' ? 'active' : ''}`}
            onClick={() => setActiveTab('collected')}
          >
            <Text className="tab-text">我收藏的</Text>
            {activeTab === 'collected' && <View className="indicator" />}
          </View>
          <View 
            className={`tab-item ${activeTab === 'viewed' ? 'active' : ''}`}
            onClick={() => setActiveTab('viewed')}
          >
            <Text className="tab-text">我看过的</Text>
            {activeTab === 'viewed' && <View className="indicator" />}
          </View>
        </View>
      </View>

      {/* Filter Bar */}
      <View className="filter-bar">
        <View className="filter-left">
          <View 
            className={`filter-pill ${city !== '全部城市' ? 'active' : ''}`}
            onClick={() => setCity(city === '全部城市' ? '北京' : '全部城市')}
          >
            <Text>{city}</Text>
            {city !== '全部城市' && (
              <Close size={10} className="close-icon" onClick={(e) => { e.stopPropagation(); setCity('全部城市') }} />
            )}
          </View>
          <View className="date-info">
             <Text className="txt">02月06日–02月07日</Text>
             <Text className="blue-txt">共1晚</Text>
          </View>
        </View>
        <View 
          className="filter-sort"
          onClick={() => setSortOption(sortOption === '最近收藏' ? '价格最低' : '最近收藏')}
        >
          <Text className={sortOption !== '最近收藏' ? 'blue' : ''}>{sortOption}</Text>
          <ArrowDown size={10} color={sortOption !== '最近收藏' ? '#33C7F7' : '#999'} />
        </View>
      </View>

      {/* List Content */}
      <ScrollView scrollY className="list-content">
        {list.length === 0 ? (
          <View className="empty-state">
             <Text className="empty-txt">还没有收藏的酒店</Text>
             <Button className="go-btn" onClick={() => Taro.switchTab({ url: '/pages/list/index' })}>去逛逛</Button>
          </View>
        ) : (
          list.map((item: any) => (
            <View key={item.id} className="hotel-card" onClick={() => goDetail(item.id)}>
              {isManaging && (
                <View className="checkbox-area" onClick={(e) => { e.stopPropagation(); toggleSelection(item.id) }}>
                  <View className={`checkbox ${selectedItems.includes(item.id) ? 'checked' : ''}`}>
                    {selectedItems.includes(item.id) && <Check size={12} color="#fff" />}
                  </View>
                </View>
              )}
              
              <View className="card-inner">
                <View className="img-box">
                  <Image src={item.image} className="hotel-img" mode="aspectFill" />
                  <View className="badge">严选</View>
                </View>
                
                <View className="info-box">
                  <View className="row-top">
                    <Text className="name">{item.name || item.title}</Text>
                    <HeartFill size={16} color={selectedItems.includes(item.id) ? '#DFA0C8' : '#ddd'} />
                  </View>

                  <View className="row-score">
                    <Text className="score">{item.score || item.rating}</Text>
                    <StarFill size={10} color="#33C7F7" className="star" />
                    <Text className="review">{item.reviewCount || item.reviews || 0}点评</Text>
                  </View>

                  <View className="row-tags">
                    {(item.tags || []).slice(0, 3).map((t: string, i: number) => (
                      <Text key={i} className="tag">{t}</Text>
                    ))}
                  </View>

                  <Text className="room-type">{item.roomType || '暂无房型信息'}</Text>
                  <Text className="location">{item.location}</Text>

                  <View className="row-price">
                    <View className="price-left">
                       <Text className="symbol">¥</Text>
                       <Text className="val">{item.price}</Text>
                       {item.oldPrice && <Text className="old">¥{item.oldPrice}</Text>}
                    </View>
                    {item.saved && <Text className="saved-badge">已省¥{item.saved}</Text>}
                  </View>
                </View>
              </View>
            </View>
          ))
        )}
        {list.length > 0 && <View className="no-more">—— 无更多数据 ——</View>}
      </ScrollView>

      {/* Bottom Management Bar */}
      {isManaging && selectedItems.length > 0 && (
        <View className="manage-bar">
          <Text className="sel-count">已选 <Text className="blue">{selectedItems.length}</Text> 项</Text>
          <Button className="cancel-btn" onClick={handleCancelCollection}>取消收藏</Button>
        </View>
      )}
    </View>
  )
}

export default FavoritePage
