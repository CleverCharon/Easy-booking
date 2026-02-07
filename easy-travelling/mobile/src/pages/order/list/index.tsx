import React, { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Tabs, TabPane, Button, Tag } from '@nutui/nutui-react-taro'
import { Left } from '@nutui/icons-react-taro'
import { useOrderStore } from '../../../store/order'
import './index.scss'

const OrderList = () => {
  const { orders } = useOrderStore()
  const [activeTab, setActiveTab] = useState('all')

  const filterOrders = (status: string) => {
    if (status === 'all') return orders
    return orders.filter(o => o.status === status)
  }

  const getStatusText = (status: string) => {
    const map = { pending: '待支付', paid: '已支付', cancelled: '已取消', completed: '已完成' }
    return map[status] || status
  }

  return (
    <View className="order-list-page">
      <View className="nav-bar">
        <Left onClick={() => Taro.navigateBack()} />
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
                <Text className="hotel-name">{order.hotelName}</Text>
                <Text className="status">{getStatusText(order.status)}</Text>
              </View>
              <View className="card-body">
                <Image src={order.hotelImage} className="hotel-img" mode="aspectFill" />
                <View className="info">
                  <Text className="room-name">{order.roomName}</Text>
                  <Text className="dates">{order.checkIn} - {order.checkOut} {order.nights}晚</Text>
                  <Text className="price">¥{order.price}</Text>
                </View>
              </View>
              <View className="card-footer">
                {order.status === 'pending' && <Button size="small" type="primary" className="action-btn">去支付</Button>}
                {order.status === 'paid' && <Button size="small" className="action-btn">查看详情</Button>}
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
