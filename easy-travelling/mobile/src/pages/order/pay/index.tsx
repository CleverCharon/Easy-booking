import { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { ArrowLeft } from '@nutui/icons-react-taro'
import { get, post } from '../../../utils/request'
import { useUserStore } from '../../../store/user'
import './index.scss'

interface OrderDetail {
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

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'

const statusTextMap: Record<number, string> = {
  0: '待支付',
  1: '已支付',
  2: '已取消',
  3: '已完成',
}

const OrderPayPage = () => {
  const router = useRouter()
  const { isLogin, userInfo } = useUserStore()
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [detail, setDetail] = useState<OrderDetail | null>(null)

  const orderId = Number(router.params.id || 0)

  const loadDetail = async () => {
    if (!orderId) {
      Taro.showToast({ title: '订单ID无效', icon: 'none' })
      return
    }
    if (!isLogin || !userInfo?.phone) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 400)
      return
    }

    setLoading(true)
    try {
      const res: any = await get(`/bookings/${orderId}/detail?phone=${encodeURIComponent(userInfo.phone)}`)
      if (!res?.id) {
        throw new Error('订单不存在')
      }
      setDetail({
        ...res,
        status: Number(res.status || 0),
        room_count: Number(res.room_count || 1),
        check_in_date: String(res.check_in_date || '').slice(0, 10),
        check_out_date: String(res.check_out_date || '').slice(0, 10),
        hotel_image: res.hotel_image || DEFAULT_IMAGE,
      })
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '加载订单失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    loadDetail()
  })

  usePullDownRefresh(() => {
    setDetail(null)
    loadDetail().finally(() => Taro.stopPullDownRefresh())
  })

  const handlePay = async () => {
    if (!detail || Number(detail.status) !== 0) return
    setPaying(true)
    try {
      await post(`/bookings/${detail.id}/pay`, {
        user_phone: userInfo?.phone || '',
        user_id: userInfo?.id || null,
      })
      Taro.showToast({ title: '支付完成', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/order/list/index?tab=paid' })
      }, 500)
    } catch (error: any) {
      console.error(error)
      Taro.showToast({ title: error?.message || '支付失败', icon: 'none' })
    } finally {
      setPaying(false)
    }
  }

  const handleCancelPay = () => {
    Taro.showToast({ title: '订单保留为待支付', icon: 'none' })
    setTimeout(() => {
      Taro.redirectTo({ url: '/pages/order/list/index?tab=pending' })
    }, 450)
  }

  const renderActions = () => {
    const status = Number(detail?.status || 0)
    if (status === 0) {
      return (
        <View className='btn-row'>
          <Button className='cancel-btn' onClick={handleCancelPay}>
            取消支付
          </Button>
          <Button className='pay-btn' loading={paying} onClick={handlePay}>
            我已支付
          </Button>
        </View>
      )
    }
    return (
      <View className='btn-row single'>
        <Button className='pay-btn' onClick={() => Taro.redirectTo({ url: '/pages/order/list/index' })}>
          返回我的订单
        </Button>
      </View>
    )
  }

  return (
    <View className='order-pay-page'>
      <View className='nav-bar'>
        <View className='back-btn' onClick={() => Taro.navigateBack()}>
          <ArrowLeft />
        </View>
        <Text className='title'>订单支付</Text>
      </View>

      <ScrollView scrollY className='content-scroll'>
        {loading || !detail ? (
          <View className='empty-wrap'>
            <Text>加载中...</Text>
          </View>
        ) : (
          <>
            <View className='status-card'>
              <Text className='label'>订单状态</Text>
              <Text className={`value status-${detail.status}`}>{statusTextMap[detail.status] || '未知状态'}</Text>
            </View>

            <View className='hotel-card'>
              <Image className='cover' src={detail.hotel_image || DEFAULT_IMAGE} mode='aspectFill' />
              <View className='meta'>
                <Text className='name'>{detail.hotel_name || '酒店'}</Text>
                <Text className='room'>{detail.room_type_name || '标准间'}</Text>
                <Text className='date'>
                  {detail.check_in_date} - {detail.check_out_date}
                </Text>
              </View>
            </View>

            <View className='price-card'>
              <View className='line'>
                <Text>订单编号</Text>
                <Text>{detail.id}</Text>
              </View>
              <View className='line'>
                <Text>入住日期</Text>
                <Text>{detail.check_in_date}</Text>
              </View>
              <View className='line'>
                <Text>离店日期</Text>
                <Text>{detail.check_out_date}</Text>
              </View>
              <View className='line total'>
                <Text>订单金额</Text>
                <Text>{`¥${detail.total_price}`}</Text>
              </View>
            </View>
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {detail && renderActions()}
    </View>
  )
}

export default OrderPayPage
