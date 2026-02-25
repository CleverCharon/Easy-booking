import { useEffect, useMemo, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { ArrowDown, Check, HeartFill, StarFill } from '@nutui/icons-react-taro'
import { useUserStore } from '../../store/user'
import { get, post } from '../../utils/request'
import './index.scss'

type FavoriteTab = 'collected' | 'viewed'
type SortMode = 'latest' | 'price_asc' | 'price_desc' | 'score_desc'

interface HotelCard {
  id: string
  name: string
  image: string
  score: number
  price: number
  tags: string[]
  address: string
  city: string
  reviewCount: number
}

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'

const sortTextMap: Record<SortMode, string> = {
  latest: '最近收藏',
  price_asc: '价格从低到高',
  price_desc: '价格从高到低',
  score_desc: '评分从高到低',
}

const sortModes: SortMode[] = ['latest', 'price_asc', 'price_desc', 'score_desc']

const normalizeTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return []
}

const normalizeHotel = (item: any): HotelCard => ({
  id: String(item.id ?? ''),
  name: item.name || item.title || '未命名酒店',
  image: item.image || item.main_image || item.image_url || DEFAULT_IMAGE,
  score: Number(item.score || item.rating || 0),
  price: Number(item.price ?? item.min_price ?? 0),
  tags: normalizeTags(item.tags),
  address: item.address || item.location || '暂无地址信息',
  city: item.city || '',
  reviewCount: Number(item.review_count || item.reviews || 0),
})

const FavoritePage = () => {
  const { userInfo, isLogin } = useUserStore()
  const [activeTab, setActiveTab] = useState<FavoriteTab>('collected')
  const [list, setList] = useState<HotelCard[]>([])
  const [loading, setLoading] = useState(false)

  const [isManaging, setIsManaging] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [cityFilter, setCityFilter] = useState('全部城市')
  const [sortMode, setSortMode] = useState<SortMode>('latest')

  const fetchData = async () => {
    if (!userInfo?.id) return
    setLoading(true)
    try {
      const endpoint = activeTab === 'collected' ? '/favorites/list' : '/history/list'
      const res = await get(`${endpoint}?user_id=${userInfo.id}`)
      const normalized = (Array.isArray(res) ? res : []).map(normalizeHotel)
      setList(normalized)
    } catch (e) {
      console.error(e)
      Taro.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    if (userInfo?.id) fetchData()
  })

  useEffect(() => {
    fetchData()
    setIsManaging(false)
    setSelectedItems([])
    setCityFilter('全部城市')
  }, [activeTab, userInfo?.id])

  const cityOptions = useMemo(() => {
    const citySet = new Set<string>()
    list.forEach((item) => {
      if (item.city) citySet.add(item.city)
    })
    return ['全部城市', ...Array.from(citySet)]
  }, [list])

  const filteredList = useMemo(() => {
    let result = [...list]
    if (cityFilter !== '全部城市') {
      result = result.filter((item) => item.city === cityFilter)
    }

    if (sortMode === 'price_asc') {
      result.sort((a, b) => a.price - b.price)
    } else if (sortMode === 'price_desc') {
      result.sort((a, b) => b.price - a.price)
    } else if (sortMode === 'score_desc') {
      result.sort((a, b) => b.score - a.score)
    } else {
      result.sort((a, b) => Number(b.id) - Number(a.id))
    }
    return result
  }, [cityFilter, list, sortMode])

  const allSelected =
    filteredList.length > 0 && filteredList.every((item) => selectedItems.includes(item.id))

  const toggleSortMode = () => {
    const current = sortModes.indexOf(sortMode)
    setSortMode(sortModes[(current + 1) % sortModes.length])
  }

  const toggleSelection = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((item) => item !== id))
    } else {
      setSelectedItems([...selectedItems, id])
    }
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedItems([])
    } else {
      setSelectedItems(filteredList.map((item) => item.id))
    }
  }

  const handleManageClick = () => {
    setIsManaging((prev) => !prev)
    setSelectedItems([])
  }

  const handleBatchCancelCollection = () => {
    if (!userInfo?.id || selectedItems.length === 0) return

    Taro.showModal({
      title: '提示',
      content: `确定取消收藏这 ${selectedItems.length} 家酒店吗？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await Promise.all(
            selectedItems.map((hotelId) =>
              post('/favorites/remove', { user_id: userInfo.id, hotel_id: hotelId })
            )
          )
          Taro.showToast({ title: '已取消收藏', icon: 'success' })
          setSelectedItems([])
          setIsManaging(false)
          fetchData()
        } catch (e) {
          console.error(e)
          Taro.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
        }
      },
    })
  }

  const handleSingleCancel = async (hotelId: string) => {
    if (!userInfo?.id) return
    try {
      await post('/favorites/remove', { user_id: userInfo.id, hotel_id: hotelId })
      setList((prev) => prev.filter((item) => item.id !== hotelId))
      setSelectedItems((prev) => prev.filter((id) => id !== hotelId))
      Taro.showToast({ title: '已取消收藏', icon: 'success' })
    } catch (e) {
      console.error(e)
      Taro.showToast({ title: '取消失败', icon: 'none' })
    }
  }

  const goDetail = (id: string) => {
    if (isManaging) return
    Taro.navigateTo({ url: `/pages/detail/index?id=${id}` })
  }

  if (!isLogin || !userInfo?.id) {
    return (
      <View className="favorite-page-v3 auth-empty">
        <Text className="empty-title">登录后可同步收藏与浏览记录</Text>
        <Button className="login-btn" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
          去登录
        </Button>
      </View>
    )
  }

  return (
    <View className="favorite-page-v3">
      <View className="top-bar">
        <Text className="title">{activeTab === 'collected' ? '我的收藏' : '浏览历史'}</Text>
        {activeTab === 'collected' && (
          <Text className="manage-btn" onClick={handleManageClick}>
            {isManaging ? '完成' : '管理'}
          </Text>
        )}
      </View>

      <View className="tabs">
        <View
          className={`tab-item ${activeTab === 'collected' ? 'active' : ''}`}
          onClick={() => setActiveTab('collected')}
        >
          我收藏的
        </View>
        <View
          className={`tab-item ${activeTab === 'viewed' ? 'active' : ''}`}
          onClick={() => setActiveTab('viewed')}
        >
          我看过的
        </View>
      </View>

      <View className="toolbar">
        <ScrollView scrollX className="city-scroll" showScrollbar={false}>
          <View className="city-list">
            {cityOptions.map((city) => (
              <View
                key={city}
                className={`city-chip ${cityFilter === city ? 'active' : ''}`}
                onClick={() => setCityFilter(city)}
              >
                {city}
              </View>
            ))}
          </View>
        </ScrollView>
        <View className="sort-btn" onClick={toggleSortMode}>
          <Text>{sortTextMap[sortMode]}</Text>
          <ArrowDown size={10} />
        </View>
      </View>

      <ScrollView scrollY className="list-content">
        {loading ? (
          <View className="empty-wrap">
            <Text className="empty-sub">加载中...</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View className="empty-wrap">
            <Text className="empty-title">还没有相关酒店</Text>
            <Text className="empty-sub">去列表页看看喜欢的酒店吧</Text>
            <Button className="go-btn" onClick={() => Taro.switchTab({ url: '/pages/list/index' })}>
              去逛逛
            </Button>
          </View>
        ) : (
          filteredList.map((item) => (
            <View key={item.id} className="hotel-card" onClick={() => goDetail(item.id)}>
              {isManaging && activeTab === 'collected' && (
                <View
                  className="check-area"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelection(item.id)
                  }}
                >
                  <View className={`check-dot ${selectedItems.includes(item.id) ? 'checked' : ''}`}>
                    {selectedItems.includes(item.id) && <Check size={12} color="#fff" />}
                  </View>
                </View>
              )}

              <Image src={item.image} className="hotel-image" mode="aspectFill" />

              <View className="card-main">
                <View className="name-row">
                  <Text className="name">{item.name}</Text>
                  {activeTab === 'collected' ? (
                    <HeartFill
                      size={16}
                      color={isManaging ? '#C5CCE8' : '#DFA0C8'}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isManaging) handleSingleCancel(item.id)
                      }}
                    />
                  ) : (
                    <View className="history-dot">浏览</View>
                  )}
                </View>

                <View className="score-row">
                  <Text className="score">{item.score.toFixed(1)}</Text>
                  <StarFill size={10} color="#33C7F7" />
                  <Text className="review">{item.reviewCount}条点评</Text>
                </View>

                <View className="tags-row">
                  {item.tags.slice(0, 3).map((tag) => (
                    <Text key={`${item.id}-${tag}`} className="tag">
                      {tag}
                    </Text>
                  ))}
                </View>

                <Text className="address">{item.address}</Text>

                <View className="price-row">
                  <Text className="price-sign">¥</Text>
                  <Text className="price">{item.price || 0}</Text>
                  <Text className="price-tip">起/晚</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {isManaging && activeTab === 'collected' && filteredList.length > 0 && (
        <View className="manage-bar">
          <View className="select-all" onClick={toggleSelectAll}>
            <View className={`check-dot ${allSelected ? 'checked' : ''}`}>
              {allSelected && <Check size={12} color="#fff" />}
            </View>
            <Text>全选</Text>
          </View>
          <Text className="count">
            已选 <Text className="num">{selectedItems.length}</Text> 项
          </Text>
          <Button
            className={`remove-btn ${selectedItems.length === 0 ? 'disabled' : ''}`}
            onClick={handleBatchCancelCollection}
          >
            取消收藏
          </Button>
        </View>
      )}
    </View>
  )
}

export default FavoritePage
