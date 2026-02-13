import React, { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Tabs, TabPane, Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { get } from '../../../utils/request'
import './index.scss'

interface Order {
  id: number
  hotel_name: string
  room_type_name: string
  check_in_date: string
  check_out_date: string
  total_price: number
  status: number
  // extra
  hotel_image?: string 
}

const OrderList = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState('all')

  const fetchOrders = async () => {
    try {
      const res = await get('/bookings/my-list')
      // Map server response if needed
      // Server returns check_in_date as full date string, let's format it
      const mapped = res.map((o: any) => ({
        ...o,
        check_in_date: o.check_in_date.slice(0, 10),
        check_out_date: o.check_out_date.slice(0, 10),
        hotel_image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=200&q=80' // Placeholder
      }))
      setOrders(mapped)
    } catch (e) {
      console.error(e)
    }
  }

  useDidShow(() => {
    fetchOrders()
  })

  const filterOrders = (tab: string) => {
    if (tab === 'all') return orders
    const statusMap: Record<string, number> = { 'pending': 0, 'paid': 1, 'cancelled': 2, 'completed': 3 }
    return orders.filter(o => o.status === statusMap[tab])
  }

  const getStatusText = (status: number) => {
    const map = { 0: '待支付', 1: '已支付', 2: '已取消', 3: '已完成' }
    return map[status] || '未知'
  }

  return (
    <View className="order-list-page">
      <View className="nav-bar">
        <ArrowLeft onClick={() => Taro.navigateBack()} />
        <Text className="title">我的订单</Text>
      </View>

      <Tabs value={activeTab} onChange={(val) => setActiveTab(val as string)} className="order-tabs">
        <TabPane title="全部" value="all" />
        <TabPane title="待支付" value="pending" />
        <TabPane title="已支付" value="paid" />
        <TabPane title="已完成" value="completed" />
      </Tabs>

      <ScrollView scrollY className="list-content">
        {filterOrders(activeTab).length === 0 ? (
          <View className="empty-state">
            <Text>暂无订单</Text>
          </View>
        ) : (
          filterOrders(activeTab).map(order => (
            <View key={order.id} className="order-card">
              <View className="card-header">
                <Text className="hotel-name">{order.hotel_name}</Text>
                <Text className="status">{getStatusText(order.status)}</Text>
              </View>
              <View className="card-body">
                <Image src={order.hotel_image || ''} className="hotel-img" mode="aspectFill" />
                <View className="info">
                  <Text className="room-name">{order.room_type_name}</Text>
                  <Text className="dates">{order.check_in_date} - {order.check_out_date}</Text>
                  <Text className="price">¥{order.total_price}</Text>
                </View>
              </View>
              <View className="card-footer">
                {order.status === 0 && <Button size="small" type="primary" className="action-btn">去支付</Button>}
                {order.status === 1 && <Button size="small" className="action-btn">查看详情</Button>}
                <Button size="small" className="action-btn">再次预订</Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

export default OrderList
