import React, { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Input, Cell, Toast } from '@nutui/nutui-react-taro'
import { Left } from '@nutui/icons-react-taro'
import { useOrderStore } from '../../../store/order'
import './index.scss'

const CreateOrder = () => {
  const router = useRouter()
  const { hotelId, roomId } = router.params
  const { addOrder } = useOrderStore()

  // Mock lookup
  const hotelName = "北京华尔道夫酒店" // In real app, fetch by hotelId
  const roomName = "豪华大床房" // In real app, fetch by roomId
  const price = 588
  const image = 'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg'

  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')

  const handleSubmit = () => {
    if (!guestName || !guestPhone) {
      Toast.show('请填写完整入住人信息')
      return
    }

    const newOrder = {
      id: Date.now().toString(),
      hotelId: hotelId || '1',
      hotelName,
      hotelImage: image,
      roomName,
      checkIn: '10月25日',
      checkOut: '10月26日',
      nights: 1,
      price,
      status: 'paid' as const, // Mock immediate payment
      guestName,
      guestPhone,
      createTime: Date.now()
    }

    addOrder(newOrder)
    Toast.show({ content: '预订成功', icon: 'success' })
    
    setTimeout(() => {
      Taro.navigateTo({ url: '/pages/order/list/index' })
    }, 1000)
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
