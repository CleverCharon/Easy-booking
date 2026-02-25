import { useEffect, useMemo, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro'
import { Button, Calendar, Input } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import dayjs from 'dayjs'
import { get, post } from '../../../utils/request'
import { useUserStore } from '../../../store/user'
import './index.scss'

interface RoomInfo {
  id: number
  name: string
  price: number
  remainCount: number
  soldOut: boolean
}

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'

const toDateValue = (v: any): string => {
  if (Array.isArray(v) && v[3]) return String(v[3])
  return String(v || '')
}

const ensureDate = (input: any, fallback: string): string => {
  const d = dayjs(input)
  if (!d.isValid()) return fallback
  return d.format('YYYY-MM-DD')
}

const CreateOrder = () => {
  const router = useRouter()
  const { hotelId, roomId, checkIn, checkOut } = router.params
  const { userInfo, isLogin } = useUserStore()

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hotelName, setHotelName] = useState('')
  const [image, setImage] = useState(DEFAULT_IMAGE)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [maxRoomCount, setMaxRoomCount] = useState(1)

  const [showCalendar, setShowCalendar] = useState(false)
  const [checkInDate, setCheckInDate] = useState(ensureDate(checkIn, dayjs().format('YYYY-MM-DD')))
  const [checkOutDate, setCheckOutDate] = useState(ensureDate(checkOut, dayjs().add(1, 'day').format('YYYY-MM-DD')))
  const [roomCount, setRoomCount] = useState(1)

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestIdCard, setGuestIdCard] = useState('')

  useEffect(() => {
    setGuestName(userInfo?.username || '')
    setGuestPhone(userInfo?.phone || '')
  }, [userInfo?.username, userInfo?.phone])

  const loadOrderData = async () => {
    if (!hotelId) return
    setLoading(true)
    try {
      const res = await get(
        `/hotels/${hotelId}?check_in_date=${encodeURIComponent(checkInDate)}&check_out_date=${encodeURIComponent(checkOutDate)}`
      )
      setHotelName(String(res?.name || '\u9152\u5e97'))
      setImage(String(res?.main_image || res?.image_url || DEFAULT_IMAGE))

      const roomList = Array.isArray(res?.rooms) ? res.rooms : []
      const selected = roomList.find((r: any) => String(r.id) === String(roomId))
      const fallback = roomList.find((r: any) => !r.sold_out) || roomList[0]
      const source = selected || fallback

      if (!source) {
        setRoom(null)
        setMaxRoomCount(1)
        setRoomCount(1)
        return
      }

      const remain = Number(source.remain_count || source.plans?.[0]?.remain_count || 0)
      const limit = Math.max(1, remain)
      setRoom({
        id: Number(source.id),
        name: String(source.name || '\u6807\u51c6\u623f'),
        price: Number(source.plans?.[0]?.price || source.price || 0),
        remainCount: remain,
        soldOut: Boolean(source.sold_out || remain <= 0),
      })
      setMaxRoomCount(limit)
      setRoomCount((prev) => Math.min(Math.max(1, prev), limit))
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '\u52a0\u8f7d\u9884\u8ba2\u4fe1\u606f\u5931\u8d25', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrderData()
  }, [hotelId, roomId, checkInDate, checkOutDate])

  usePullDownRefresh(() => {
    setHotelName('')
    setRoom(null)
    setImage(DEFAULT_IMAGE)
    loadOrderData().finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  const nights = useMemo(() => {
    const diff = dayjs(checkOutDate).diff(dayjs(checkInDate), 'day')
    return diff > 0 ? diff : 1
  }, [checkInDate, checkOutDate])

  const totalPrice = useMemo(() => Number(room?.price || 0) * roomCount * nights, [room?.price, roomCount, nights])
  const checkInLabel = useMemo(() => dayjs(checkInDate).format('MM-DD'), [checkInDate])
  const checkOutLabel = useMemo(() => dayjs(checkOutDate).format('MM-DD'), [checkOutDate])

  const handleDateConfirm = (param: any) => {
    if (Array.isArray(param) && param.length >= 2) {
      const inDate = ensureDate(toDateValue(param[0]), checkInDate)
      const outDate = ensureDate(toDateValue(param[1]), checkOutDate)
      if (dayjs(outDate).isAfter(dayjs(inDate), 'day')) {
        setCheckInDate(inDate)
        setCheckOutDate(outDate)
      }
    }
    setShowCalendar(false)
  }

  const validateForm = () => {
    if (!guestName.trim()) {
      Taro.showToast({ title: '\u8bf7\u8f93\u5165\u5165\u4f4f\u4eba\u59d3\u540d', icon: 'none' })
      return false
    }
    if (!/^1\d{10}$/.test(guestPhone.trim())) {
      Taro.showToast({ title: '\u8bf7\u8f93\u5165\u6b63\u786e\u624b\u673a\u53f7', icon: 'none' })
      return false
    }
    if (!/^(\d{15}|\d{17}[\dXx])$/.test(guestIdCard.trim())) {
      Taro.showToast({ title: '\u8bf7\u8f93\u5165\u6b63\u786e\u8eab\u4efd\u8bc1\u53f7', icon: 'none' })
      return false
    }
    if (!room || room.soldOut || room.remainCount <= 0) {
      Taro.showToast({ title: '\u8be5\u623f\u578b\u4e0d\u53ef\u9884\u8ba2', icon: 'none' })
      return false
    }
    if (roomCount > Math.max(1, room.remainCount)) {
      Taro.showToast({ title: '\u8d85\u51fa\u5e93\u5b58\u53ef\u7528\u6570\u91cf', icon: 'none' })
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!isLogin || !userInfo?.id) {
      Taro.showToast({ title: '\u8bf7\u5148\u767b\u5f55', icon: 'none' })
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500)
      return
    }
    if (!validateForm() || !room) return

    setSubmitting(true)
    try {
      await post('/bookings/create', {
        user_id: userInfo.id,
        user_name: guestName.trim(),
        user_phone: guestPhone.trim(),
        user_id_card: guestIdCard.trim(),
        hotel_id: hotelId,
        hotel_name: hotelName,
        room_type_id: room.id,
        room_type_name: room.name,
        room_count: roomCount,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        total_price: totalPrice,
      })

      Taro.showToast({ title: '\u9884\u8ba2\u6210\u529f', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/order/list/index' })
      }, 600)
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '\u9884\u8ba2\u5931\u8d25', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="order-create-v2">
      <View className="nav-bar">
        <View className="back-btn" onClick={() => Taro.navigateBack()}>
          <ArrowLeft />
        </View>
        <Text className="title">{'\u786e\u8ba4\u9884\u8ba2'}</Text>
      </View>

      <ScrollView scrollY className="page-scroll">
        <View className="hotel-card">
          <Image src={image} className="hotel-cover" mode="aspectFill" />
          <View className="hotel-body">
            <Text className="hotel-name">{loading ? '\u52a0\u8f7d\u4e2d...' : hotelName || '\u9152\u5e97'}</Text>
            <Text className="room-name">
              {room?.name || '\u623f\u578b\u5f85\u786e\u8ba4'}
              {room ? ` - \u5269\u4f59${Math.max(0, room.remainCount)}\u95f4` : ''}
            </Text>
            <Text className="price">{`\u00a5${room?.price || 0} / \u665a`}</Text>
          </View>
        </View>

        <View className="date-card" onClick={() => setShowCalendar(true)}>
          <View className="date-col">
            <Text className="label">{'\u5165\u4f4f'}</Text>
            <Text className="date">{checkInLabel}</Text>
          </View>
          <View className="mid">
            <Text className="nights">{`\u5171${nights}\u665a`}</Text>
            <Text className="line" />
          </View>
          <View className="date-col">
            <Text className="label">{'\u79bb\u5e97'}</Text>
            <Text className="date">{checkOutLabel}</Text>
          </View>
        </View>

        <View className="form-card">
          <Text className="section-title">{'\u5165\u4f4f\u4fe1\u606f'}</Text>
          <View className="form-row">
            <Text className="row-label">{'\u5165\u4f4f\u4eba\u59d3\u540d'}</Text>
            <Input
              className="row-input"
              placeholder="\u8bf7\u8f93\u5165\u59d3\u540d"
              value={guestName}
              onChange={(val: any) => setGuestName(String(val || ''))}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'\u624b\u673a\u53f7\u7801'}</Text>
            <Input
              className="row-input"
              placeholder="\u8bf7\u8f93\u5165\u624b\u673a\u53f7"
              type="number"
              value={guestPhone}
              onChange={(val: any) => setGuestPhone(String(val || ''))}
              maxLength={11}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'\u8eab\u4efd\u8bc1\u53f7'}</Text>
            <Input
              className="row-input"
              placeholder="\u7528\u4e8e\u5b9e\u540d\u5165\u4f4f"
              value={guestIdCard}
              onChange={(val: any) => setGuestIdCard(String(val || ''))}
              maxLength={18}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'\u9884\u8ba2\u95f4\u6570'}</Text>
            <View className="counter">
              <View className="counter-btn" onClick={() => setRoomCount((c) => Math.max(1, c - 1))}>
                -
              </View>
              <Text className="counter-num">{roomCount}</Text>
              <View className="counter-btn" onClick={() => setRoomCount((c) => Math.min(maxRoomCount, c + 1))}>
                +
              </View>
            </View>
          </View>
        </View>

        <View className="price-card">
          <Text className="section-title">{'\u8d39\u7528\u660e\u7ec6'}</Text>
          <View className="price-line">
            <Text>{`\u623f\u8d39 (\u00a5${room?.price || 0} x ${nights}\u665a x ${roomCount}\u95f4)`}</Text>
            <Text>{`\u00a5${totalPrice}`}</Text>
          </View>
          <View className="price-line total">
            <Text>{'\u603b\u8ba1'}</Text>
            <Text>{`\u00a5${totalPrice}`}</Text>
          </View>
        </View>
      </ScrollView>

      <View className="bottom-bar">
        <View className="amount">
          <Text className="label">{'\u5408\u8ba1'}</Text>
          <Text className="value">{`\u00a5${totalPrice}`}</Text>
        </View>
        <Button className="submit-btn" loading={submitting} onClick={handleSubmit}>
          {'\u63d0\u4ea4\u8ba2\u5355'}
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

export default CreateOrder
