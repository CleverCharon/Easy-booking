import { useMemo, useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh, useRouter } from '@tarojs/taro'
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
  room_count?: number
  check_in_date: string
  check_out_date: string
  total_price: number
  status: number
  hotel_image?: string
}

const tabs: { key: TabKey; text: string }[] = [
  { key: 'all', text: '全部' },
  { key: 'pending', text: '待支付' },
  { key: 'paid', text: '已支付' },
  { key: 'cancelled', text: '已取消' },
  { key: 'completed', text: '已完成' },
]

const statusMap: Record<TabKey, number> = {
  all: -1,
  pending: 0,
  paid: 1,
  cancelled: 2,
  completed: 3,
}

const statusTextMap: Record<number, string> = {
  0: '待支付',
  1: '已支付',
  2: '已取消',
  3: '已完成',
}

const statusClassMap: Record<number, string> = {
  0: 'pending',
  1: 'paid',
  2: 'cancelled',
  3: 'completed',
}

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'

const normalizeTab = (input: string): TabKey => {
  if (input === 'pending' || input === 'paid' || input === 'cancelled' || input === 'completed') return input
  return 'all'
}

const OrderList = () => {
  const router = useRouter()
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
        room_count: Number(item.room_count || 1),
        status: Number(item.status || 0),
        hotel_image: item.hotel_image || item.image_url || DEFAULT_IMAGE,
      }))
      setOrders(mapped)
    } catch (error) {
      console.error(error)
      Taro.showToast({ title: '加载订单失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    setActiveTab(normalizeTab(String(router.params.tab || 'all')))
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
      Taro.showToast({ title: '缺少酒店ID', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: `/pages/detail/index?id=${order.hotel_id}` })
  }

  const handleCancel = async (order: Order) => {
    if (![0, 1].includes(Number(order.status))) return
    try {
      await post(`/bookings/${order.id}/cancel`)
      Taro.showToast({ title: '订单已取消', icon: 'none' })
      fetchOrders()
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '取消失败', icon: 'none' })
    }
  }

  if (!isLogin || !userInfo) {
    return (
      <View className='order-list-v2 auth-empty'>
        <Text className='empty-title'>请登录后查看订单</Text>
        <Button className='login-btn' onClick={() => Taro.navigateTo({ url: '/pages/login/index' })}>
          去登录
        </Button>
      </View>
    )
  }

  return (
    <View className='order-list-v2'>
      <View className='nav-bar'>
        <View className='back-btn' onClick={() => Taro.navigateBack()}>
          <ArrowLeft />
        </View>
        <Text className='title'>我的订单</Text>
      </View>

      <ScrollView scrollX className='tabs-scroll' showScrollbar={false}>
        <View className='tabs-wrap'>
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

      <ScrollView scrollY className='list-content'>
        {loading ? (
          <View className='empty-wrap'>
            <Text className='empty-sub'>加载中...</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View className='empty-wrap'>
            <Text className='empty-title'>暂无订单</Text>
            <Text className='empty-sub'>你的预订记录会显示在这里</Text>
            <Button className='go-btn' onClick={() => Taro.switchTab({ url: '/pages/list/index' })}>
              去预订酒店
            </Button>
          </View>
        ) : (
          filteredOrders.map((order) => (
            <View key={order.id} className='order-card'>
              <View className='card-top'>
                <Text className='hotel-name'>{order.hotel_name || '酒店'}</Text>
                <Text className={`status ${statusClassMap[order.status] || ''}`}>
                  {statusTextMap[order.status] || '未知状态'}
                </Text>
              </View>

              <View className='card-body'>
                <Image src={order.hotel_image || DEFAULT_IMAGE} className='hotel-img' mode='aspectFill' />
                <View className='meta'>
                  <Text className='room-name'>{order.room_type_name || '标准间'}</Text>
                  <Text className='dates'>
                    {order.check_in_date} - {order.check_out_date}
                  </Text>
                  <Text className='price'>{`¥${order.total_price}`}</Text>
                </View>
              </View>

              <View className='card-actions'>
                {[0, 1].includes(Number(order.status)) && (
                  <Button className='minor-btn' onClick={() => handleCancel(order)}>
                    取消订单
                  </Button>
                )}
                {![0, 1].includes(Number(order.status)) && (
                  <Button className='minor-btn' onClick={() => handleRebook(order)}>
                    再次预订
                  </Button>
                )}
                {Number(order.status) === 0 && (
                  <Button className='major-btn' onClick={() => Taro.navigateTo({ url: `/pages/order/pay/index?id=${order.id}` })}>
                    去支付
                  </Button>
                )}
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
