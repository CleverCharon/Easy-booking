import { useMemo, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { get, post } from '../../../utils/request'
import { useUserStore } from '../../../store/user'
import './index.scss'

type TabKey = 'all' | 'pending' | 'paid' | 'cancelled' | 'completed'

interface Order {
  id: number
  hotel_id: number
  hotel_name: string
  room_type_name: string
  check_in_date: string
  check_out_date: string
  total_price: number
  status: number
  hotel_image?: string
}

const tabs: { key: TabKey; text: string }[] = [
  { key: 'all', text: '\u5168\u90e8' },
  { key: 'pending', text: '\u5f85\u652f\u4ed8' },
  { key: 'paid', text: '\u5df2\u652f\u4ed8' },
  { key: 'cancelled', text: '\u5df2\u53d6\u6d88' },
  { key: 'completed', text: '\u5df2\u5b8c\u6210' },
]

const statusMap: Record<TabKey, number> = {
  all: -1,
  pending: 0,
  paid: 1,
  cancelled: 2,
  completed: 3,
}

const statusTextMap: Record<number, string> = {
  0: '\u5f85\u652f\u4ed8',
  1: '\u5df2\u652f\u4ed8',
  2: '\u5df2\u53d6\u6d88',
  3: '\u5df2\u5b8c\u6210',
}

const statusClassMap: Record<number, string> = {
  0: 'pending',
  1: 'paid',
  2: 'cancelled',
  3: 'completed',
}

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'

const OrderList = () => {
  const { userInfo, isLogin } = useUserStore()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  const fetchOrders = async () => {
    if (!isLogin || !userInfo) return
    const phone = userInfo.phone
    if (!phone) {
      setOrders([])
      return
    }

    setLoading(true)
    try {
      const res = await get(`/bookings/my-list?phone=${encodeURIComponent(phone)}`)
      const mapped: Order[] = (Array.isArray(res) ? res : []).map((item: any) => ({
        ...item,
        check_in_date: String(item.check_in_date || '').slice(0, 10),
        check_out_date: String(item.check_out_date || '').slice(0, 10),
        hotel_image: item.hotel_image || item.image_url || DEFAULT_IMAGE,
      }))
      setOrders(mapped)
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '\u52a0\u8f7d\u8ba2\u5355\u5931\u8d25', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    fetchOrders()
  })

  usePullDownRefresh(() => {
    setOrders([])
    fetchOrders().finally(() => {
      Taro.stopPullDownRefresh()
    })
  })

  const filteredOrders = useMemo(() => {
    const status = statusMap[activeTab]
    if (status === -1) return orders
    return orders.filter((o) => Number(o.status) === status)
  }, [activeTab, orders])

  const handleRebook = (order: Order) => {
    if (!order.hotel_id) {
      Taro.showToast({ title: '\u7f3a\u5c11\u9152\u5e97ID', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: `/pages/detail/index?id=${order.hotel_id}` })
  }

  const handleCancel = async (order: Order) => {
    if (![0, 1].includes(Number(order.status))) return
    try {
      await post(`/bookings/${order.id}/cancel`)
      Taro.showToast({ title: '\u8ba2\u5355\u5df2\u53d6\u6d88', icon: 'none' })
      fetchOrders()
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '\u53d6\u6d88\u5931\u8d25', icon: 'none' })
    }
  }

  const handlePrimaryAction = (order: Order) => {
    if (order.status === 0) {
      Taro.showToast({ title: '\u652f\u4ed8\u529f\u80fd\u5f00\u53d1\u4e2d', icon: 'none' })
      return
    }
    Taro.showToast({ title: `\u8ba2\u5355 #${order.id}`, icon: 'none' })
  }

  if (!isLogin || !userInfo) {
    return (
      <View className="order-list-v2 auth-empty">
        <Text className="empty-title">{'\u8bf7\u767b\u5f55\u540e\u67e5\u770b\u8ba2\u5355'}</Text>
        <Button className="login-btn" onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
          {'\u53bb\u767b\u5f55'}
        </Button>
      </View>
    )
  }

  return (
    <View className="order-list-v2">
      <View className="nav-bar">
        <View className="back-btn" onClick={() => Taro.navigateBack()}>
          <ArrowLeft />
        </View>
        <Text className="title">{'\u6211\u7684\u8ba2\u5355'}</Text>
      </View>

      <ScrollView scrollX className="tabs-scroll" showScrollbar={false}>
        <View className="tabs-wrap">
          {tabs.map((tab) => (
            <View
              key={tab.key}
              className={`tab-item ${tab.key === activeTab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.text}
            </View>
          ))}
        </View>
      </ScrollView>

      <ScrollView scrollY className="list-content">
        {loading ? (
          <View className="empty-wrap">
            <Text className="empty-sub">{'\u52a0\u8f7d\u4e2d...'}</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View className="empty-wrap">
            <Text className="empty-title">{'\u6682\u65e0\u8ba2\u5355'}</Text>
            <Text className="empty-sub">{'\u4f60\u7684\u9884\u8ba2\u8bb0\u5f55\u4f1a\u663e\u793a\u5728\u8fd9\u91cc'}</Text>
            <Button className="go-btn" onClick={() => Taro.switchTab({ url: '/pages/list/index' })}>
              {'\u53bb\u9884\u8ba2\u9152\u5e97'}
            </Button>
          </View>
        ) : (
          filteredOrders.map((order) => (
            <View key={order.id} className="order-card">
              <View className="card-top">
                <Text className="hotel-name">{order.hotel_name || '\u9152\u5e97'}</Text>
                <Text className={`status ${statusClassMap[order.status] || ''}`}>
                  {statusTextMap[order.status] || '\u672a\u77e5\u72b6\u6001'}
                </Text>
              </View>

              <View className="card-body">
                <Image src={order.hotel_image || DEFAULT_IMAGE} className="hotel-img" mode="aspectFill" />
                <View className="meta">
                  <Text className="room-name">{order.room_type_name || '\u6807\u51c6\u623f'}</Text>
                  <Text className="dates">
                    {order.check_in_date} - {order.check_out_date}
                  </Text>
                  <Text className="price">{`\u00a5${order.total_price}`}</Text>
                </View>
              </View>

              <View className="card-actions">
                {[0, 1].includes(Number(order.status)) && (
                  <Button className="minor-btn" onClick={() => handleCancel(order)}>
                    {'\u53d6\u6d88\u8ba2\u5355'}
                  </Button>
                )}
                {![0, 1].includes(Number(order.status)) && (
                  <Button className="minor-btn" onClick={() => handleRebook(order)}>
                    {'\u518d\u6b21\u9884\u8ba2'}
                  </Button>
                )}
                <Button className="major-btn" onClick={() => handlePrimaryAction(order)}>
                  {order.status === 0 ? '\u53bb\u652f\u4ed8' : '\u67e5\u770b'}
                </Button>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}

export default OrderList
