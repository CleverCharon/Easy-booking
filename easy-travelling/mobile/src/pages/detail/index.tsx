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

const normalizeImageList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((x) => String(x || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[，,]/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
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
    if (!id) {
      Taro.showToast({ title: '缺少酒店ID', icon: 'none' })
      return
    }
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
      Taro.showToast({ title: '加载酒店详情失败', icon: 'none' })
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
    const all = new Set<string>()
    normalizeImageList(hotel?.images).forEach((url) => all.add(url))
    normalizeImageList(hotel?.main_image).forEach((url) => all.add(url))
    normalizeImageList(hotel?.image_url).forEach((url) => all.add(url))
    roomList.forEach((room) => {
      normalizeImageList(room.image_url).forEach((url) => all.add(url))
    })
    const images = Array.from(all)
    return images.length > 0 ? images : [DEFAULT_IMAGE]
  }, [hotel, roomList])

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
        await post('/favorites/remove', { user_id: userInfo.id, hotel_id: id })
        setIsFavorite(false)
        Taro.showToast({ title: '已取消收藏', icon: 'none' })
      } else {
        await post('/favorites/add', { user_id: userInfo.id, hotel_id: id })
        setIsFavorite(true)
        Taro.showToast({ title: '收藏成功', icon: 'success' })
      }
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '操作失败', icon: 'none' })
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
      Taro.showToast({ title: '暂无可预订房型', icon: 'none' })
      return
    }
    if (selectedRoomInfo.sold_out || Number(selectedRoomInfo.remain_count || 0) <= 0) {
      Taro.showToast({ title: '该房型已售罄', icon: 'none' })
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
          <Text className="nav-title">{hotel?.name || '酒店详情'}</Text>
          <View className="right-btns">
            <View className="btn share-btn">
              <Text className="share-text">{'分享'}</Text>
            </View>
            <View className="btn" onClick={toggleFavorite}>
              {isFavorite ? <HeartFill color="#DFA0C8" /> : <Heart color="#fff" />}
            </View>
        </View>
      </View>

      <ScrollView scrollY className="content-scroll" onScroll={(e: any) => setIsScrolled(Number(e.detail.scrollTop || 0) > 80)}>
        <View className="banner-wrap">
          <Swiper className="custom-swiper" autoPlay indicator>
            {hotelImages.map((img, idx) => (
              <SwiperItem key={`${img}-${idx}`}>
                <Image src={img || DEFAULT_IMAGE} mode="aspectFill" className="banner-img" />
              </SwiperItem>
            ))}
          </Swiper>
          <View className="gradient-overlay" />
          <View className="rating-badge">
            <StarFill size={12} color="#33C7F7" />
            <Text className="txt">{`${Number(hotel?.score || 0).toFixed(1)}分`}</Text>
          </View>
          <View className="official-badge">
            <Text className="txt">{'官方图片'}</Text>
          </View>
        </View>

        <View className="info-card">
          <View className="header">
            <Text className="name">{hotel?.name || '酒店详情'}</Text>
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
            <Text className="level">{`${Number(hotel?.star_level || 0)}星酒店`}</Text>
          </View>

          <View className="address-row">
            <Location size={12} color="#33C7F7" />
            <Text className="addr-txt">{hotel?.address || `${hotel?.city || ''}`}</Text>
            <View className="map-btn">{'地图'}</View>
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
              <Text className="label">{'入住'}</Text>
              <Text className="val">{dayjs(checkInDate).format('MM-DD')}</Text>
            </View>
            <View className="col">
              <Text className="val blue">{`共${nights}晚`}</Text>
              <Text className="info">{`${guests}人 - ${rooms}间`}</Text>
            </View>
            <View className="col">
              <Text className="label">{'离店'}</Text>
              <Text className="val">{dayjs(checkOutDate).format('MM-DD')}</Text>
            </View>
          </View>
          <Text className="edit-btn">{'修改'}</Text>
        </View>

        <View className="room-list">
          {loading ? (
            <View className="room-card">
              <View className="card-content">
                <Text>{'房型加载中...'}</Text>
              </View>
            </View>
          ) : roomList.length === 0 ? (
            <View className="room-card">
              <View className="card-content">
                <Text>{'暂无房型数据'}</Text>
              </View>
            </View>
          ) : (
            roomList.map((room) => {
              const active = Number(selectedRoom) === Number(room.id)
              const price = Number(room.plans?.[0]?.price || 0)
              const featureList = String(room.description || '')
                .split(/[，,]/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 4)
              return (
                <View key={room.id} className={`room-card ${active ? 'selected' : ''}`}>
                  <View className="card-content">
                    <View className="head-row">
                      <Text className="r-name">{room.name}</Text>
                      <View className="r-tags">
                        <Text className="r-tag blue">{`剩${Math.max(0, Number(room.remain_count || 0))}间`}</Text>
                        {room.sold_out ? (
                          <Text className="r-tag pink">{'已售罄'}</Text>
                        ) : (
                          <Text className="r-tag pink">{'可预订'}</Text>
                        )}
                      </View>
                    </View>

                    <View className="features">
                      {(featureList.length > 0 ? featureList : ['可住2人', '独立卫浴']).map((feature) => (
                        <View className="feat-item" key={feature}>
                          <Text>{`- ${feature}`}</Text>
                        </View>
                      ))}
                    </View>

                    <View className="price-row">
                      <View className="left">
                        <Text className="curr">{`¥${price}`}</Text>
                        <Text className="old">{`¥${Math.max(price + 80, price)}`}</Text>
                        <Text className="disc">{'优惠价'}</Text>
                      </View>
                      <View
                        className={`book-btn ${active ? 'selected' : ''}`}
                        onClick={() => {
                          if (!room.sold_out) setSelectedRoom(room.id)
                        }}
                      >
                        {room.sold_out ? '已售罄' : active ? '已选择' : '选择'}
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
            {`${dayjs(checkInDate).format('MM-DD')} - ${dayjs(checkOutDate).format('MM-DD')} - 共${nights}晚`}
          </Text>
          <View className="price-box">
            <Text className="val">{`¥${selectedPrice || 0}`}</Text>
            <Text className="unit">{'起/晚'}</Text>
          </View>
        </View>
        <Button className="main-btn" onClick={handleBook}>
          {'立即预订'}
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

