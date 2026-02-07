import React, { useState } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import Taro, { useRouter, usePageScroll } from '@tarojs/taro'
import { Swiper, SwiperItem, Button, Popup, Toast } from '@nutui/nutui-react-taro'
import { 
  Share, Heart, HeartFill, StarFill, Environment as EnvironmentOutlined, 
  Left, Check, Minus, Plus, Close 
} from '@nutui/icons-react-taro'
import { useFavoriteStore } from '../../store/favorite'
import './index.scss'

const MOCK_HOTEL_DETAIL = {
  id: '1',
  name: '北京华尔道夫酒店',
  score: 4.8,
  reviewCount: 320,
  address: '北京市东城区金鱼胡同甲1号',
  images: [
    'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg',
    'https://img10.360buyimg.com/ling/jfs/t1/198797/16/32777/94747/67a57c5aF73351989/65d95393132e4d0d.jpg',
    'https://img12.360buyimg.com/ling/jfs/t1/179505/16/40552/68310/67a57a8eF9682705a/3943365851410915.jpg'
  ],
  tags: ['亲子酒店', '新开业'],
  services: ['免费停车', '自助入住', '含早餐'],
  rooms: [
    { id: 'r1', name: '豪华大床房', tags: ['可取消', '含早餐'], features: ['30㎡', '大床2米', '含早餐', '免费WiFi'], price: 588, oldPrice: 688, discount: '立减100' },
    { id: 'r2', name: '行政套房', tags: ['会员特惠', '含早餐'], features: ['45㎡', '大床2米', '含早餐', '行政待遇'], price: 888, oldPrice: 1088, discount: '会员价' },
    { id: 'r3', name: '标准双床房', tags: ['特价'], features: ['25㎡', '双床1.2米', '含早餐', '免费WiFi'], price: 458, oldPrice: 558, discount: '限时特价' },
    { id: 'r4', name: '家庭套房', tags: ['亲子推荐'], features: ['50㎡', '大床+单床', '含早餐', '儿童乐园'], price: 1288, oldPrice: 1588, discount: '家庭优惠' }
  ]
}

const DetailPage = () => {
  const router = useRouter()
  // Ensure id is a string to avoid type errors
  const id = (router.params.id || '1') as string
  
  const { isFavorite, addFavorite, removeFavorite } = useFavoriteStore()
  const [hotel] = useState(MOCK_HOTEL_DETAIL)
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  
  // Date & Guest Selection
  const [showCalendar, setShowCalendar] = useState(false)
  const [checkInDate, setCheckInDate] = useState('10月25日')
  const [checkOutDate, setCheckOutDate] = useState('10月26日')
  const [nights, setNights] = useState(1)
  const [guests, setGuests] = useState(2)
  const [rooms, setRooms] = useState(1)

  usePageScroll((res) => {
    setIsScrolled(res.scrollTop > 100)
  })

  const toggleFav = () => {
    const simpleHotel = {
      id: hotel.id,
      name: hotel.name,
      image: hotel.images[0],
      score: hotel.score,
      price: hotel.rooms[0].price,
      tags: hotel.tags,
      location: '东城区'
    }
    if (isFavorite(hotel.id)) {
      removeFavorite(hotel.id)
      Toast.show('已取消收藏')
    } else {
      addFavorite(simpleHotel)
      Toast.show('已收藏')
    }
  }

  const handleBook = () => {
    console.log('handleBook called, selectedRoomId:', selectedRoomId)
    if (!selectedRoomId) {
      Toast.show('请选择房型')
      // Scroll to room list
      Taro.pageScrollTo({ selector: '.room-list', duration: 300 })
      return
    }
    const url = `/pages/order/create/index?hotelId=${hotel.id}&roomId=${selectedRoomId}`
    console.log('Navigating to:', url)
    Taro.navigateTo({
      url: url,
      success: () => console.log('Navigate success'),
      fail: (err) => {
        console.error('Navigate failed:', err)
        Toast.show('跳转失败: ' + JSON.stringify(err))
      }
    })
  }

  const selectRoom = (e: any, roomId: string) => {
    e.stopPropagation()
    setSelectedRoomId(roomId)
  }

  // Simple mock calendar generator
  const generateCalendarDays = () => {
    const days = []
    for (let i = 0; i < 35; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      days.push({
        day: date.getDate(),
        full: date.toISOString().split('T')[0],
        isToday: i === 0
      })
    }
    return days
  }
  const calendarDays = generateCalendarDays()

  return (
    <View className="detail-page-v4">
      {/* Top Navigation Bar */}
      <View className={`nav-bar ${isScrolled ? 'scrolled' : ''}`}>
        <View className="left-btn" onClick={() => Taro.navigateBack()}>
          <Left color="#fff" size={20} />
        </View>
        <Text className={`nav-title ${isScrolled ? 'visible' : ''}`}>{hotel.name}</Text>
        <View className="right-btns">
          <View className="btn"><Share color="#fff" size={20} /></View>
          <View className="btn" onClick={toggleFav}>
            {isFavorite(hotel.id) ? <HeartFill color="#DFA0C8" size={20} /> : <Heart color="#fff" size={20} />}
          </View>
        </View>
      </View>

      <ScrollView scrollY className="content-scroll">
        {/* Image Banner Carousel */}
        <View className="banner-wrap">
          <Swiper 
            height={280} 
            autoPlay 
            paginationVisible 
            paginationColor="#fff"
            loop
            className="custom-swiper"
          >
            {hotel.images.map((img, idx) => (
              <SwiperItem key={idx}>
                <Image src={img} mode="aspectFill" className="banner-img" />
              </SwiperItem>
            ))}
          </Swiper>
          {/* Gradient overlay */}
          <View className="gradient-overlay" />
          
          {/* Rating badge (Top Left) */}
          <View className="rating-badge">
            <StarFill size={10} color="#33C7F7" />
            <Text className="txt">{hotel.score}分 · {hotel.reviewCount}条</Text>
          </View>

          {/* Official photo badge (Bottom Left) */}
          <View className="official-badge">
            <Text className="txt">官方图片</Text>
          </View>
        </View>

        {/* Basic Info Card */}
        <View className="info-card">
          <View className="header">
            <Text className="name">{hotel.name}</Text>
            <View className="tags">
              {hotel.tags.map((t, i) => (
                <Text key={i} className={`tag ${i % 2 === 0 ? 'blue' : 'pink'}`}>{t}</Text>
              ))}
            </View>
          </View>

          <View className="star-row">
            {[1,2,3,4,5].map(i => <StarFill key={i} size={12} color={i<=4 ? '#33C7F7' : '#eee'} style={{marginRight: 2}} />)}
            <Text className="level">五星级酒店</Text>
          </View>

          <View className="address-row">
            <EnvironmentOutlined size={14} color="#33C7F7" />
            <Text className="addr-txt">{hotel.address}</Text>
            <View className="map-btn">地图</View>
          </View>

          <View className="services-row">
             <View className="svc"><Image src="https://img12.360buyimg.com/imagetools/jfs/t1/196430/38/8105/14329/60c806a4Ed506298a/e6de9fb7b8490f38.png" className="svc-icon" /><Text>免费停车</Text></View>
             <View className="svc"><Image src="https://img12.360buyimg.com/imagetools/jfs/t1/196430/38/8105/14329/60c806a4Ed506298a/e6de9fb7b8490f38.png" className="svc-icon" /><Text>自助入住</Text></View>
             <View className="svc"><Image src="https://img12.360buyimg.com/imagetools/jfs/t1/196430/38/8105/14329/60c806a4Ed506298a/e6de9fb7b8490f38.png" className="svc-icon" /><Text>含早餐</Text></View>
          </View>
        </View>

        {/* Calendar and Guests Card */}
        <View className="date-card" onClick={() => setShowCalendar(true)}>
          <View className="date-sec">
             <View className="col">
               <Text className="label">入住</Text>
               <Text className="val">{checkInDate}</Text>
             </View>
             <View className="col">
               <Text className="label">离店</Text>
               <Text className="val">{checkOutDate}</Text>
             </View>
             <View className="col">
               <Text className="info">共{nights}晚</Text>
               <Text className="val blue">{guests}人·{rooms}间</Text>
             </View>
          </View>
          <Text className="edit-btn">修改</Text>
        </View>

        {/* Room Types List */}
        <View className="room-list">
          {hotel.rooms.map(room => (
            <View 
              key={room.id} 
              className={`room-card ${selectedRoomId === room.id ? 'selected' : ''}`}
              onClick={(e) => selectRoom(e, room.id)}
            >
              <View className="card-content">
                <View className="head-row">
                  <Text className="r-name">{room.name}</Text>
                  <View className="r-tags">
                    {room.tags.map((t, i) => (
                      <Text key={i} className={`r-tag ${t.includes('会员') || t.includes('特价') ? 'pink' : 'blue'}`}>{t}</Text>
                    ))}
                  </View>
                </View>

                <View className="features">
                  {room.features.map((f, i) => (
                    <View key={i} className="feat-item">
                      <Check size={10} color="#33C7F7" />
                      <Text>{f}</Text>
                    </View>
                  ))}
                </View>

                <View className="price-row">
                  <View className="left">
                    <Text className="curr">¥{room.price}</Text>
                    <Text className="old">¥{room.oldPrice}</Text>
                    <Text className="disc">{room.discount}</Text>
                  </View>
                  <View 
                    className={`book-btn ${selectedRoomId === room.id ? 'selected' : ''}`}
                    onClick={(e) => selectRoom(e, room.id)}
                  >
                    {selectedRoomId === room.id ? '已选' : '预订'}
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="bottom-bar">
        <View className="info">
          <Text className="desc">{checkInDate} - {checkOutDate} · {nights}晚 · {guests}人</Text>
          <View className="price-box">
            <Text className="val">¥{selectedRoomId ? hotel.rooms.find(r => r.id === selectedRoomId)?.price : hotel.rooms[0].price}</Text>
            <Text className="unit">起/晚</Text>
          </View>
        </View>
        <View className="main-btn" onClick={handleBook}>立即预订</View>
      </View>

      {/* Calendar Modal */}
      <Popup visible={showCalendar} position="bottom" round onClose={() => setShowCalendar(false)}>
        <View className="calendar-modal">
          <View className="modal-head">
            <Text className="tit">选择日期</Text>
            <Close size={20} onClick={() => setShowCalendar(false)} color="#999" />
          </View>
          
          <View className="modal-body">
            {/* Calendar Grid */}
            <View className="calendar-grid">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <Text key={d} className="week-day">{d}</Text>
              ))}
              {calendarDays.map((d, i) => (
                <View 
                  key={i} 
                  className={`day-cell ${
                    checkInDate.includes(d.day.toString()) || checkOutDate.includes(d.day.toString()) 
                    ? 'active' : ''
                  } ${d.isToday ? 'today' : ''}`}
                >
                  <Text className="day-num">{d.day}</Text>
                </View>
              ))}
            </View>

            {/* Guest Selector */}
            <View className="guest-selector">
              <Text className="sec-tit">入住人数</Text>
              
              <View className="sel-row">
                <Text>入住人数</Text>
                <View className="counter">
                   <Minus size={12} onClick={() => setGuests(Math.max(1, guests - 1))} />
                   <Text className="num">{guests}</Text>
                   <Plus size={12} onClick={() => setGuests(Math.min(10, guests + 1))} />
                </View>
              </View>

              <View className="sel-row">
                <Text>房间数</Text>
                <View className="counter">
                   <Minus size={12} onClick={() => setRooms(Math.max(1, rooms - 1))} />
                   <Text className="num">{rooms}</Text>
                   <Plus size={12} onClick={() => setRooms(Math.min(5, rooms + 1))} />
                </View>
              </View>
            </View>

            <Button className="confirm-btn" onClick={() => setShowCalendar(false)}>确认</Button>
          </View>
        </View>
      </Popup>
    </View>
  )
}

export default DetailPage
