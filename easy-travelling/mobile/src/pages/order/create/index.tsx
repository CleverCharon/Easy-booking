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
      setHotelName(String(res?.name || '酒店'))
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
        name: String(source.name || '标准房'),
        price: Number(source.plans?.[0]?.price || source.price || 0),
        remainCount: remain,
        soldOut: Boolean(source.sold_out || remain <= 0),
      })
      setMaxRoomCount(limit)
      setRoomCount((prev) => Math.min(Math.max(1, prev), limit))
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '加载预订信息失败', icon: 'none' })
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
      Taro.showToast({ title: '请输入入住人姓名', icon: 'none' })
      return false
    }
    if (!/^1\d{10}$/.test(guestPhone.trim())) {
      Taro.showToast({ title: '请输入正确手机号', icon: 'none' })
      return false
    }
    if (!/^(\d{15}|\d{17}[\dXx])$/.test(guestIdCard.trim())) {
      Taro.showToast({ title: '请输入正确身份证号', icon: 'none' })
      return false
    }
    if (!room || room.soldOut || room.remainCount <= 0) {
      Taro.showToast({ title: '该房型不可预订', icon: 'none' })
      return false
    }
    if (roomCount > Math.max(1, room.remainCount)) {
      Taro.showToast({ title: '超出库存可用数量', icon: 'none' })
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!isLogin || !userInfo?.id) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500)
      return
    }
    if (!validateForm() || !room) return

    setSubmitting(true)
    try {
      const result: any = await post('/bookings/create', {
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

      const orderId = Number(result?.orderId || 0)
      if (!orderId) {
        throw new Error('创建订单失败')
      }

      Taro.showToast({ title: '订单已创建', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: `/pages/order/pay/index?id=${orderId}` })
      }, 600)
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '预订失败', icon: 'none' })
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
        <Text className="title">{'确认预订'}</Text>
      </View>

      <ScrollView scrollY className="page-scroll">
        <View className="hotel-card">
          <Image src={image} className="hotel-cover" mode="aspectFill" />
          <View className="hotel-body">
            <Text className="hotel-name">{loading ? '加载中...' : hotelName || '酒店'}</Text>
            <Text className="room-name">
              {room?.name || '房型待确认'}
              {room ? ` - 剩余${Math.max(0, room.remainCount)}间` : ''}
            </Text>
            <Text className="price">{`¥${room?.price || 0} / 晚`}</Text>
          </View>
        </View>

        <View className="date-card" onClick={() => setShowCalendar(true)}>
          <View className="date-col">
            <Text className="label">{'入住'}</Text>
            <Text className="date">{checkInLabel}</Text>
          </View>
          <View className="mid">
            <Text className="nights">{`共${nights}晚`}</Text>
            <Text className="line" />
          </View>
          <View className="date-col">
            <Text className="label">{'离店'}</Text>
            <Text className="date">{checkOutLabel}</Text>
          </View>
        </View>

        <View className="form-card">
          <Text className="section-title">{'入住信息'}</Text>
          <View className="form-row">
            <Text className="row-label">{'入住人姓名'}</Text>
            <Input
              className="row-input"
              placeholder="请输入姓名"
              value={guestName}
              onChange={(val: any) => setGuestName(String(val || ''))}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'手机号码'}</Text>
            <Input
              className="row-input"
              placeholder="请输入手机号"
              type="number"
              value={guestPhone}
              onChange={(val: any) => setGuestPhone(String(val || ''))}
              maxLength={11}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'身份证号'}</Text>
            <Input
              className="row-input"
              placeholder="用于实名入住"
              value={guestIdCard}
              onChange={(val: any) => setGuestIdCard(String(val || ''))}
              maxLength={18}
            />
          </View>
          <View className="form-row">
            <Text className="row-label">{'预订间数'}</Text>
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
          <Text className="section-title">{'费用明细'}</Text>
          <View className="price-line">
            <Text>{`房费 (¥${room?.price || 0} x ${nights}晚 x ${roomCount}间)`}</Text>
            <Text>{`¥${totalPrice}`}</Text>
          </View>
          <View className="price-line total">
            <Text>{'总计'}</Text>
            <Text>{`¥${totalPrice}`}</Text>
          </View>
        </View>
      </ScrollView>

      <View className="bottom-bar">
        <View className="amount">
          <Text className="label">{'合计'}</Text>
          <Text className="value">{`¥${totalPrice}`}</Text>
        </View>
        <Button className="submit-btn" loading={submitting} onClick={handleSubmit}>
          {'提交订单'}
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

