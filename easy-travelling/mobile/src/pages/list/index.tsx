import { useEffect, useMemo, useState } from 'react'
import { View, Text, Image, ScrollView, Input } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import dayjs from 'dayjs'
import { Search, Heart, HeartFill, StarFill, Location, Close } from '@nutui/icons-react-taro'
import { Button, Popup } from '@nutui/nutui-react-taro'
import { useSearchStore } from '../../store/search'
import { useFavoriteStore, Hotel } from '../../store/favorite'
import { useUserStore } from '../../store/user'
import { get, post } from '../../utils/request'
import './index.scss'

interface HotelCard extends Hotel {
  city?: string
  availableStock?: number
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean)
  return []
}

const parseStarOption = (option: string): number | null => {
  if (option.includes('2')) return 2
  if (option.includes('3')) return 3
  if (option.includes('4')) return 4
  if (option.includes('5')) return 5
  return null
}

const ListPage = () => {
  const {
    city,
    startDate,
    endDate,
    keyword,
    setKeyword,
    minPrice,
    maxPrice,
    starLevels,
    setPriceRange,
    setStarLevels,
  } = useSearchStore()
  const { isFavorite, addFavorite, removeFavorite, setFavorites } = useFavoriteStore()
  const { userInfo } = useUserStore()

  const [list, setList] = useState<HotelCard[]>([])
  const [loading, setLoading] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const [localMinPrice, setLocalMinPrice] = useState(minPrice)
  const [localMaxPrice, setLocalMaxPrice] = useState(maxPrice)
  const [localStars, setLocalStars] = useState<string[]>(starLevels)

  const nights = useMemo(() => {
    const diff = dayjs(endDate).diff(dayjs(startDate), 'day')
    return diff > 0 ? diff : 1
  }, [endDate, startDate])

  const fetchHotels = async () => {
    setLoading(true)
    try {
      const qs = [
        city ? `city_name=${encodeURIComponent(city)}` : '',
        keyword.trim() ? `keyword=${encodeURIComponent(keyword.trim())}` : '',
        startDate ? `check_in_date=${encodeURIComponent(startDate)}` : '',
        endDate ? `check_out_date=${encodeURIComponent(endDate)}` : '',
      ]
        .filter(Boolean)
        .join('&')

      const res = await get(`/hotels${qs ? `?${qs}` : ''}`)
      const hotelList: HotelCard[] = (Array.isArray(res) ? res : []).map((item: any) => {
        const tags = normalizeTags(item.tags)
        return {
          id: String(item.id),
          name: String(item.name || '\u9152\u5e97'),
          image: String(item.main_image || item.image_url || DEFAULT_IMAGE),
          score: Number(item.score || 4.6),
          price: Number(item.min_price || item.price || 0),
          tags,
          location: String(item.address || ''),
          star: Number(item.star_level || 0),
          city: String(item.city || ''),
          availableStock: Number(item.available_stock || 0),
        }
      })
      setList(hotelList)
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '\u52a0\u8f7d\u9152\u5e97\u5931\u8d25', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const fetchFavorites = async () => {
    if (!userInfo?.id) return
    try {
      const res = await get(`/favorites/list?user_id=${userInfo.id}`)
      const favHotels: Hotel[] = (Array.isArray(res) ? res : []).map((item: any) => ({
        id: String(item.id),
        name: String(item.name || '\u9152\u5e97'),
        image: String(item.image_url || item.main_image || DEFAULT_IMAGE),
        score: Number(item.score || 4.6),
        price: Number(item.min_price || item.price || 0),
        tags: normalizeTags(item.tags),
        location: String(item.address || ''),
        star: Number(item.star_level || 0),
      }))
      setFavorites(favHotels)
    } catch (error) {
      console.error('fetchFavorites error:', error)
    }
  }

  useEffect(() => {
    fetchHotels()
  }, [city, startDate, endDate])

  useEffect(() => {
    fetchFavorites()
  }, [userInfo?.id])

  usePullDownRefresh(() => {
    setList([])
    setSelectedFilters([])
    Promise.all([fetchHotels(), fetchFavorites()]).finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  const filteredList = useMemo(() => {
    let result = [...list]

    if (keyword.trim()) {
      const key = keyword.trim()
      result = result.filter((h) => h.name.includes(key) || h.location?.includes(key) || h.tags.some((t) => t.includes(key)))
    }

    if (minPrice > 0 || maxPrice < 10000) {
      result = result.filter((h) => h.price >= minPrice && h.price <= maxPrice)
    }

    if (starLevels.length > 0) {
      const targetStars = starLevels.map((s) => parseStarOption(s)).filter((x): x is number => x !== null)
      if (targetStars.length > 0) {
        result = result.filter((h) => Number(h.star || 0) > 0 && targetStars.includes(Number(h.star)))
      }
    }

    if (selectedFilters.length > 0) {
      result = result.filter((h) => selectedFilters.every((tag) => h.tags.includes(tag)))
    }

    return result
  }, [keyword, list, maxPrice, minPrice, selectedFilters, starLevels])

  const navigateLoginWithToast = (title: string) => {
    Taro.showToast({ title, icon: 'none' })
    setTimeout(() => {
      Taro.navigateTo({ url: '/pages/login/index' })
    }, 350)
  }

  const toggleFav = async (e: any, hotel: Hotel) => {
    e.stopPropagation()
    if (!userInfo?.id) {
      navigateLoginWithToast('请先登录后再收藏')
      return
    }
    if (isFavorite(hotel.id)) {
      removeFavorite(hotel.id)
      try {
        await post('/favorites/remove', { user_id: userInfo.id, hotel_id: hotel.id })
      } catch (error) {
        addFavorite(hotel)
        Taro.showToast({ title: '\u53d6\u6d88\u6536\u85cf\u5931\u8d25', icon: 'none' })
      }
      return
    }

    addFavorite(hotel)
    try {
      await post('/favorites/add', { user_id: userInfo.id, hotel_id: hotel.id })
    } catch (error) {
      removeFavorite(hotel.id)
      Taro.showToast({ title: '\u6536\u85cf\u5931\u8d25', icon: 'none' })
    }
  }

  const goDetail = (id: string) => {
    Taro.navigateTo({
      url: `/pages/detail/index?id=${id}&checkIn=${encodeURIComponent(startDate)}&checkOut=${encodeURIComponent(endDate)}`,
    })
  }

  const handleBookClick = (e: any, hotelId: string) => {
    e.stopPropagation()
    if (!userInfo?.id) {
      navigateLoginWithToast('请先登录后再预订')
      return
    }
    goDetail(hotelId)
  }

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
      setLocalStars(localStars.filter((s) => s !== star))
      return
    }
    setLocalStars([...localStars, star])
  }

  const toggleChip = (chip: string) => {
    if (selectedFilters.includes(chip)) {
      setSelectedFilters(selectedFilters.filter((f) => f !== chip))
      return
    }
    setSelectedFilters([...selectedFilters, chip])
  }

  const chips = [
    '\u514d\u8d39\u505c\u8f66',
    '\u542b\u65e9\u9910',
    '\u8fd1\u5730\u94c1',
    '\u514d\u8d39\u53d6\u6d88',
    '\u4eb2\u5b50\u53cb\u597d',
    '\u5065\u8eab\u623f',
    '\u6e38\u6cf3\u6c60',
    '\u53ef\u5e26\u5ba0\u7269',
  ]
  const starOptions = ['2\u661f/\u7ecf\u6d4e', '3\u661f/\u8212\u9002', '4\u661f/\u9ad8\u6863', '5\u661f/\u8c6a\u534e']
  const priceOptions = [
    { label: '\u4e0d\u9650', min: 0, max: 10000 },
    { label: '\u00a5150\u4ee5\u4e0b', min: 0, max: 150 },
    { label: '\u00a5150-300', min: 150, max: 300 },
    { label: '\u00a5300-450', min: 300, max: 450 },
    { label: '\u00a5450-600', min: 450, max: 600 },
    { label: '\u00a5600-1000', min: 600, max: 1000 },
    { label: '\u00a51000\u4ee5\u4e0a', min: 1000, max: 10000 },
  ]

  return (
    <View className="list-page-v2">
      <View className="list-header">
        <View className="search-summary">
          <View className="row1">
            <Text>{city || '\u5168\u90e8\u57ce\u5e02'}</Text>
            <Text className="date">
              {dayjs(startDate).format('MM-DD')} - {dayjs(endDate).format('MM-DD')}
            </Text>
            <Text className="nights">{`\u5171${nights}\u665a`}</Text>
          </View>
          <View className="input-wrap">
            <Search size={12} color="#999" className="icon" />
            <Input
              className="search-input"
              placeholder="\u9152\u5e97\u540d/\u5730\u5740/\u6807\u7b7e"
              value={keyword}
              onInput={(e: any) => setKeyword(String(e.detail.value || ''))}
            />
          </View>
        </View>
        <View className="map-btn">
          <Location size={20} color="#25255F" />
        </View>
      </View>

      <View className="filter-bar">
        {['\u4f4d\u7f6e', '\u4ef7\u683c/\u661f\u7ea7', '\u4eba\u6570/\u623f\u95f4', '\u7b5b\u9009'].map((text, idx) => (
          <View key={idx} className="filter-item" onClick={openFilter}>
            <Text>{text}</Text>
          </View>
        ))}
      </View>

      <ScrollView scrollX className="chips-scroll" showScrollbar={false}>
        <View className="chips-flex">
          {chips.map((chip) => (
            <View
              key={chip}
              className={`chip-item ${selectedFilters.includes(chip) ? 'active' : ''}`}
              onClick={() => toggleChip(chip)}
            >
              {chip}
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView scrollY className="hotel-list">
        {loading ? (
          <View className="skeleton-list">
            {[1, 2, 3].map((i) => (
              <View key={i} className="sk-card">
                <Text>{'\u52a0\u8f7d\u4e2d...'}</Text>
              </View>
            ))}
          </View>
        ) : (
          filteredList.map((hotel) => (
            <View key={hotel.id} className="hotel-card" onClick={() => goDetail(hotel.id)}>
              <View className="img-wrapper">
                <Image src={hotel.image || DEFAULT_IMAGE} className="hotel-img" mode="aspectFill" />
                <View className="badge">
                  {hotel.availableStock && hotel.availableStock > 0
                    ? `\u5269\u4f59${hotel.availableStock}\u95f4`
                    : '\u53ef\u9884\u8ba2'}
                </View>
                <View className="fav-btn" onClick={(e: any) => toggleFav(e, hotel)}>
                  {isFavorite(hotel.id) ? <HeartFill color="#DFA0C8" /> : <Heart color="#ccc" />}
                </View>
              </View>

              <View className="card-info">
                <View className="name-row">
                  <Text className="name">{hotel.name}</Text>
                  <View className="score-box">
                    <Text className="score">{Number(hotel.score || 0).toFixed(1)}</Text>
                    <StarFill color="#33C7F7" size={10} />
                  </View>
                </View>
                <Text className="distance">{hotel.location || `${hotel.city || ''}`}</Text>

                <View className="tags">
                  {hotel.tags.slice(0, 4).map((tag) => (
                    <Text key={tag} className="tag">
                      {tag}
                    </Text>
                  ))}
                </View>

                <View className="price-row">
                  <View className="price-left">
                    <Text className="symbol">{'\u00a5'}</Text>
                    <Text className="price">{hotel.price || 0}</Text>
                  </View>
                  <Button
                    size="small"
                    className="book-btn"
                    onClick={(e: any) => handleBookClick(e, hotel.id)}
                  >
                    {'\u9884\u8ba2'}
                  </Button>
                </View>
              </View>
            </View>
          ))
        )}
        {!loading && <View className="no-more">{'\u6ca1\u6709\u66f4\u591a\u9152\u5e97\u4e86'}</View>}
      </ScrollView>

      <Popup visible={showFilter} position="bottom" onClose={() => setShowFilter(false)} round style={{ height: '60%' }}>
        <View className="filter-popup">
          <View className="popup-header">
            <Text className="title">{'\u7b5b\u9009\u6761\u4ef6'}</Text>
            <Close size={18} onClick={() => setShowFilter(false)} />
          </View>
          <ScrollView scrollY className="popup-body">
            <View className="section">
              <Text className="label">{'\u661f\u7ea7'}</Text>
              <View className="stars">
                {starOptions.map((star) => (
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
              <Text className="label">{'\u4ef7\u683c\u533a\u95f4'}</Text>
              <View className="price-opts">
                {priceOptions.map((p) => {
                  const active = localMinPrice === p.min && localMaxPrice === p.max
                  return (
                    <View
                      key={p.label}
                      className={`opt-item ${active ? 'active' : ''}`}
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
            <Button className="reset-btn" onClick={resetFilter}>
              {'\u91cd\u7f6e'}
            </Button>
            <Button className="confirm-btn" type="primary" onClick={applyFilter}>
              {`\u67e5\u770b${filteredList.length}\u5bb6`}
            </Button>
          </View>
        </View>
      </Popup>
    </View>
  )
}

export default ListPage
