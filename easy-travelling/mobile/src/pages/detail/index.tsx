import { useEffect, useMemo, useState } from 'react'
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { Button, Calendar, Swiper, SwiperItem } from '@nutui/nutui-react-taro'
import { ArrowLeft, Heart, HeartFill, StarFill, Location } from '@nutui/icons-react-taro'
import dayjs from 'dayjs'
import { useUserStore } from '../../store/user'
import { useSearchStore } from '../../store/search'
import { get, post } from '../../utils/request'
import './index.scss'

interface RoomPlan {
  id: number
  name: string
  price: number
  remain_count: number
  sold_out: boolean
}

interface RoomType {
  id: number
  name: string
  description?: string
  image_url?: string
  remain_count: number
  sold_out: boolean
  plans: RoomPlan[]
}

interface HotelDetail {
  id: number
  name: string
  address?: string
  city?: string
  star_level?: number
  score?: number
  tags?: string[]
  image_url?: string
  main_image?: string
  images?: string[]
  rooms?: RoomType[]
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'

const toYmd = (v: any, fallback: string): string => {
  const d = dayjs(v)
  if (!d.isValid()) return fallback
  return d.format('YYYY-MM-DD')
}

const toCalendarDate = (value: any): string => {
  if (Array.isArray(value) && value[3]) return String(value[3])
  return String(value || '')
}

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean)
  return []
}

const DetailPage = () => {
  const router = useRouter()
  const id = String(router.params.id || '')
  const initialCheckIn = toYmd(router.params.checkIn, dayjs().format('YYYY-MM-DD'))
  const initialCheckOut = toYmd(router.params.checkOut, dayjs().add(1, 'day').format('YYYY-MM-DD'))

  const { userInfo } = useUserStore()
  const { setDates } = useSearchStore()

  const [hotel, setHotel] = useState<HotelDetail | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkInDate, setCheckInDate] = useState(initialCheckIn)
  const [checkOutDate, setCheckOutDate] = useState(initialCheckOut)
  const [guests] = useState(2)
  const [rooms] = useState(1)

  const roomList = useMemo(() => (Array.isArray(hotel?.rooms) ? hotel!.rooms! : []), [hotel])

  const nights = useMemo(() => {
    const diff = dayjs(checkOutDate).diff(dayjs(checkInDate), 'day')
    return diff > 0 ? diff : 1
  }, [checkInDate, checkOutDate])

  const selectedRoomInfo = useMemo(
    () => roomList.find((r) => Number(r.id) === Number(selectedRoom)) || roomList[0],
    [roomList, selectedRoom]
  )

  const selectedPrice = Number(selectedRoomInfo?.plans?.[0]?.price || 0)

  const fetchFavoriteState = async () => {
    if (!userInfo?.id || !id) return
    try {
      const favRes = await get(`/favorites/list?user_id=${userInfo.id}`)
      const favored = (Array.isArray(favRes) ? favRes : []).some((item: any) => String(item.id) === id)
      setIsFavorite(favored)
    } catch (error) {
      console.error('fetchFavoriteState error:', error)
    }
  }

  const fetchDetail = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await get(
        `/hotels/${id}?check_in_date=${encodeURIComponent(checkInDate)}&check_out_date=${encodeURIComponent(checkOutDate)}`
      )
      const detail: HotelDetail = {
        ...res,
        tags: normalizeTags(res?.tags),
        rooms: Array.isArray(res?.rooms) ? res.rooms : [],
      }
      setHotel(detail)
      if (userInfo?.id) {
        await post('/history/add', { user_id: userInfo.id, hotel_id: id }).catch(() => undefined)
      }
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '\u52a0\u8f7d\u9152\u5e97\u8be6\u60c5\u5931\u8d25', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id, checkInDate, checkOutDate])

  useEffect(() => {
    fetchFavoriteState()
  }, [id, userInfo?.id])

  usePullDownRefresh(() => {
    setHotel(null)
    setSelectedRoom(null)
    Promise.all([fetchDetail(), fetchFavoriteState()]).finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  useEffect(() => {
    if (roomList.length === 0) {
      setSelectedRoom(null)
      return
    }
    const current = roomList.find((room) => Number(room.id) === Number(selectedRoom))
    if (current && !current.sold_out) return
    const firstAvailable = roomList.find((room) => !room.sold_out)
    setSelectedRoom(firstAvailable ? firstAvailable.id : roomList[0].id)
  }, [roomList, selectedRoom])

  const hotelImages = useMemo(() => {
    const fromServer = Array.isArray(hotel?.images) ? hotel!.images! : []
    if (fromServer.length > 0) return fromServer
    return [hotel?.main_image || hotel?.image_url || DEFAULT_IMAGE]
  }, [hotel])

  const navigateLoginWithToast = (title: string) => {
    Taro.showToast({ title, icon: 'none' })
    setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 350)
  }

  const toggleFavorite = async () => {
    if (!userInfo?.id) {
      navigateLoginWithToast('请先登录后再收藏')
      return
    }
    try {
      if (isFavorite) {
        await post('/favorites/remove', { user_id: userInfo.id, hotel_id: id });
        setIsFavorite(false);
        Taro.showToast({ title: '已取消收藏', icon: 'none' });
        await post('/favorites/remove', { user_id: userInfo.id, hotel_id: id })
        setIsFavorite(false)
        Taro.showToast({ title: '\u5df2\u53d6\u6d88\u6536\u85cf', icon: 'none' })
      } else {
        await post('/favorites/add', { user_id: userInfo.id, hotel_id: id });
        setIsFavorite(true);
        Taro.showToast({ title: '收藏成功', icon: 'success' });
        await post('/favorites/add', { user_id: userInfo.id, hotel_id: id })
        setIsFavorite(true)
        Taro.showToast({ title: '\u6536\u85cf\u6210\u529f', icon: 'success' })
      }
    } catch (e) {
      console.error('Favorite operation failed:', e);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  /**
   * 处理预订操作
   */
  // const handleBook = () => { ... } // Removed unused function

  useEffect(() => {
    const handleScroll = () => {
      // 监听滚动位置以切换导航栏样式
      if (window.scrollY > 100) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const hotelImages = hotel?.images || [];
  const roomTypes = hotel?.rooms?.map((r: any) => ({
    id: r.id,
    name: r.name,
    tags: r.plans?.[0]?.name ? [r.plans[0].name] : [],
    features: [`${r.area}㎡`, `最多${r.max_guests}人`],
    price: r.plans?.[0]?.price || 999,
    originalPrice: r.plans?.[0]?.price ? Math.floor(r.plans[0].price * 1.2) : 1299,
    discount: '优惠价'
  })) || [];

  const handleDateChange = (param: any) => {
    // 处理 NutUI 日历的范围选择结果
    if (param && param.length >= 2) {
      const start = new Date(param[0][3]);
      const end = new Date(param[1][3]);
      setCheckInDate(`${start.getMonth() + 1}月${start.getDate()}日`);
      setCheckOutDate(`${end.getMonth() + 1}月${end.getDate()}日`);
      
      // 计算入住时长
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setNights(diffDays);
    }
    setShowCalendar(false);
  };
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '\u64cd\u4f5c\u5931\u8d25', icon: 'none' })
    }
  }

  const handleDateConfirm = (param: any) => {
    if (Array.isArray(param) && param.length >= 2) {
      const inDate = toCalendarDate(param[0])
      const outDate = toCalendarDate(param[1])
      const nextIn = toYmd(inDate, checkInDate)
      const nextOut = toYmd(outDate, checkOutDate)
      if (dayjs(nextOut).isAfter(dayjs(nextIn), 'day')) {
        setCheckInDate(nextIn)
        setCheckOutDate(nextOut)
        setDates(nextIn, nextOut)
      }
    }
    setShowCalendar(false)
  }

  const handleBook = () => {
    if (!userInfo?.id) {
      navigateLoginWithToast('请先登录后再预订')
      return
    }
    if (!selectedRoomInfo) {
      Taro.showToast({ title: '\u6682\u65e0\u53ef\u9884\u8ba2\u623f\u578b', icon: 'none' })
      return
    }
    if (selectedRoomInfo.sold_out || Number(selectedRoomInfo.remain_count || 0) <= 0) {
      Taro.showToast({ title: '\u8be5\u623f\u578b\u5df2\u552e\u7f44', icon: 'none' })
      return
    }

    Taro.navigateTo({
      url:
        `/pages/order/create/index?hotelId=${id}` +
        `&roomId=${selectedRoomInfo.id}` +
        `&checkIn=${encodeURIComponent(checkInDate)}` +
        `&checkOut=${encodeURIComponent(checkOutDate)}`,
    })
  }

  return (
    <View className="detail-page-v4">
        <View className={`nav-bar ${isScrolled ? 'scrolled' : ''}`}>
          <View className="left-btn" onClick={() => Taro.navigateBack()}>
            <ArrowLeft color="#fff" />
          </View>
          <Text className="nav-title">{hotel?.name || '\u9152\u5e97\u8be6\u60c5'}</Text>
          <View className="right-btns">
            <View className="btn share-btn">
              <Text className="share-text">{'\u5206\u4eab'}</Text>
            </View>
            <View className="btn" onClick={toggleFavorite}>
              {isFavorite ? <HeartFill color="#DFA0C8" /> : <Heart color="#fff" />}
            </View>
        </View>
      </View>

      <ScrollView scrollY className="content-scroll" onScroll={(e: any) => setIsScrolled(Number(e.detail.scrollTop || 0) > 80)}>
        <View className="banner-wrap">
          <Swiper className="custom-swiper" autoPlay indicator>
            {hotelImages.map((img) => (
              <SwiperItem key={img}>
                <Image src={img || DEFAULT_IMAGE} mode="aspectFill" className="banner-img" />
              </SwiperItem>
            ))}
          </Swiper>
          <View className="gradient-overlay" />
          <View className="rating-badge">
            <StarFill size={12} color="#33C7F7" />
            <Text className="txt">{`${Number(hotel?.score || 0).toFixed(1)}\u5206`}</Text>
          </View>
          <View className="official-badge">
            <Text className="txt">{'\u5b98\u65b9\u56fe\u7247'}</Text>
          </View>
        </View>

        <View className="info-card">
          <View className="header">
            <Text className="name">{hotel?.name || '\u9152\u5e97\u8be6\u60c5'}</Text>
            <View className="tags">
              {(hotel?.tags || []).slice(0, 2).map((tag, idx) => (
                <Text key={`${tag}-${idx}`} className={`tag ${idx === 0 ? 'blue' : 'pink'}`}>
                  {tag}
                </Text>
              ))}
            </View>
          </View>

          <View className="star-row">
            <StarFill size={12} color="#33C7F7" />
            <Text className="level">{`${Number(hotel?.star_level || 0)}\u661f\u9152\u5e97`}</Text>
          </View>

          <View className="address-row">
            <Location size={12} color="#33C7F7" />
            <Text className="addr-txt">{hotel?.address || `${hotel?.city || ''}`}</Text>
            <View className="map-btn">{'\u5730\u56fe'}</View>
          </View>

          <View className="services-row">
            {(hotel?.tags || []).slice(0, 3).map((tag) => (
              <View className="svc" key={tag}>
                <Text className="svc-icon">-</Text>
                <Text>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="date-card" onClick={() => setShowCalendar(true)}>
          <View className="date-sec">
            <View className="col">
              <Text className="label">{'\u5165\u4f4f'}</Text>
              <Text className="val">{dayjs(checkInDate).format('MM-DD')}</Text>
            </View>
            <View className="col">
              <Text className="val blue">{`\u5171${nights}\u665a`}</Text>
              <Text className="info">{`${guests}\u4eba - ${rooms}\u95f4`}</Text>
            </View>
            <View className="col">
              <Text className="label">{'\u79bb\u5e97'}</Text>
              <Text className="val">{dayjs(checkOutDate).format('MM-DD')}</Text>
            </View>
          </View>
          <Text className="edit-btn">{'\u4fee\u6539'}</Text>
        </View>

        <View className="room-list">
          {loading ? (
            <View className="room-card">
              <View className="card-content">
                <Text>{'\u623f\u578b\u52a0\u8f7d\u4e2d...'}</Text>
              </View>
            </View>
          ) : roomList.length === 0 ? (
            <View className="room-card">
              <View className="card-content">
                <Text>{'\u6682\u65e0\u623f\u578b\u6570\u636e'}</Text>
              </View>
            </View>
          ) : (
            roomList.map((room) => {
              const active = Number(selectedRoom) === Number(room.id)
              const price = Number(room.plans?.[0]?.price || 0)
              const featureList = String(room.description || '')
                .split(/[\uFF0C,]/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 4)
              return (
                <View key={room.id} className={`room-card ${active ? 'selected' : ''}`}>
                  <View className="card-content">
                    <View className="head-row">
                      <Text className="r-name">{room.name}</Text>
                      <View className="r-tags">
                        <Text className="r-tag blue">{`\u5269${Math.max(0, Number(room.remain_count || 0))}\u95f4`}</Text>
                        {room.sold_out ? (
                          <Text className="r-tag pink">{'\u5df2\u552e\u7f44'}</Text>
                        ) : (
                          <Text className="r-tag pink">{'\u53ef\u9884\u8ba2'}</Text>
                        )}
                      </View>
                    </View>

                    <View className="features">
                      {(featureList.length > 0 ? featureList : ['\u53ef\u4f4f2\u4eba', '\u72ec\u7acb\u536b\u6d74']).map((feature) => (
                        <View className="feat-item" key={feature}>
                          <Text>{`- ${feature}`}</Text>
                        </View>
                      ))}
                    </View>

                    <View className="price-row">
                      <View className="left">
                        <Text className="curr">{`\u00a5${price}`}</Text>
                        <Text className="old">{`\u00a5${Math.max(price + 80, price)}`}</Text>
                        <Text className="disc">{'\u4f18\u60e0\u4ef7'}</Text>
                      </View>
                      <View
                        className={`book-btn ${active ? 'selected' : ''}`}
                        onClick={() => {
                          if (!room.sold_out) setSelectedRoom(room.id)
                        }}
                      >
                        {room.sold_out ? '\u5df2\u552e\u7f44' : active ? '\u5df2\u9009\u62e9' : '\u9009\u62e9'}
                      </View>
                    </View>
                  </View>
                </View>
              )
            })
          )}
        </View>

      </ScrollView>

      <View className="bottom-bar">
        <View className="info">
          <Text className="desc">
            {`${dayjs(checkInDate).format('MM-DD')} - ${dayjs(checkOutDate).format('MM-DD')} - \u5171${nights}\u665a`}
          </Text>
          <View className="price-box">
            <Text className="val">{`\u00a5${selectedPrice || 0}`}</Text>
            <Text className="unit">{'\u8d77/\u665a'}</Text>
          </View>
        </View>
        <Button className="main-btn" onClick={handleBook}>
          {'\u7acb\u5373\u9884\u8ba2'}
        </Button>
      </View>

      <Calendar
        visible={showCalendar}
        type="range"
        defaultValue={[checkInDate, checkOutDate]}
        startDate={dayjs().format('YYYY-MM-DD')}
        onClose={() => setShowCalendar(false)}
        onConfirm={handleDateConfirm}
      />
    </View>
  )
}

export default DetailPage
