import React, { useState, useEffect } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Input, Cell, Toast } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { post, get } from '../../../utils/request'
import './index.scss'

const CreateOrder = () => {
  const router = useRouter()
  const { hotelId, roomId } = router.params
  
  const [hotelName, setHotelName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [price, setPrice] = useState(0)
  const [image, setImage] = useState('')

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestIdCard, setGuestIdCard] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!hotelId) return
      try {
        const res = await get(`/hotels/${hotelId}`)
        setHotelName(res.name)
        setImage(res.main_image)
        
        // Find room info
        if (res.rooms) {
          const room = res.rooms.find((r: any) => String(r.id) === String(roomId))
          if (room) {
            setRoomName(room.name)
            setPrice(room.plans?.[0]?.price || room.price)
          }
        }
      } catch (e) {
        console.error(e)
        Toast.show('获取信息失败')
      }
    }
    fetchData()
  }, [hotelId, roomId])

  const handleSubmit = async () => {
    if (!guestName || !guestPhone || !guestIdCard) {
      Toast.show('请填写完整入住人信息(含身份证)')
      return
    }

    try {
      await post('/bookings/create', {
        user_name: guestName,
        user_phone: guestPhone,
        user_id_card: guestIdCard,
        hotel_id: hotelId,
        hotel_name: hotelName,
        room_type_name: roomName, // Backend expects room_type_name? check index.js
        // Wait, server expects 'room_type_name' but index.js INSERTs it?
        // Let's check server again. Server SQL: INSERT INTO bookings ... room_type_name is not in INSERT list!
        // Wait, check server index.js again.
        // SQL: INSERT INTO bookings (user_name, ..., hotel_name, check_in_date, ...)
        // It DOES NOT insert room_type_name in the snippet I saw!
        // But the TABLE has room_type_name.
        // I should fix server index.js too.
        
        check_in_date: '2025-10-25', // Hardcoded for demo
        check_out_date: '2025-10-26',
        total_price: price
      })
      
      Toast.show({ content: '预订成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/order/list/index' })
      }, 1000)
    } catch (e) {
      Toast.show('预订失败')
    }
  }

  return (
    <View className="order-create-page">
      <View className="nav-bar">
        <ArrowLeft onClick={() => Taro.navigateBack()} />
        <Text className="title">确认订单</Text>
      </View>

      <View className="card hotel-info">
        <Text className="h-name">{hotelName}</Text>
        <Text className="r-name">{roomName}</Text>
        <Text className="dates">10月25日 - 10月26日 共1晚</Text>
      </View>

      <View className="card form">
        <Text className="section-title">入住人信息</Text>
        <Input 
          label="姓名" 
          placeholder="请输入入住人姓名" 
          value={guestName} 
          onChange={(val) => setGuestName(val)} 
        />
        <Input 
          label="手机号" 
          placeholder="请输入联系手机号" 
          value={guestPhone} 
          onChange={(val) => setGuestPhone(val)} 
        />
        <Input 
          label="身份证" 
          placeholder="请输入身份证号" 
          value={guestIdCard} 
          onChange={(val) => setGuestIdCard(val)} 
        />
      </View>

      <View className="card price-info">
        <Cell title="房费" extra={`¥${price}`} />
        <Cell title="优惠" extra="-¥0" />
        <Cell title="总价" extra={<Text className="total-price">¥{price}</Text>} />
      </View>

      <View className="bottom-bar">
        <View className="price-col">
          <Text className="label">合计:</Text>
          <Text className="val">¥{price}</Text>
        </View>
        <Button type="primary" className="submit-btn" onClick={handleSubmit}>提交订单</Button>
      </View>
    </View>
  )
}

export default CreateOrder
