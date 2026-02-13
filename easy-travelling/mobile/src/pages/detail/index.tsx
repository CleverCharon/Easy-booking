import React, { useState, useEffect } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View, Text, Image } from '@tarojs/components';
import { Button, Calendar, Rate, Tag, Toast } from '@nutui/nutui-react-taro';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation } from 'swiper/modules';
import {
  HeartOutlined,
  HeartFilled,
  ShareAltOutlined,
  StarFilled,
  EnvironmentOutlined,
  UserOutlined,
  CheckCircleFilled,
  ArrowLeftOutlined,
  CarOutlined,
  BellOutlined,
  CoffeeOutlined
} from '@ant-design/icons';
import { useUserStore } from '../../store/user';
import { post, get } from '../../utils/request';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const App: React.FC = () => {
  const router = useRouter();
  const { id } = router.params;
  const { userInfo } = useUserStore();
  const [hotel, setHotel] = useState<any>(null);
  
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [checkInDate, setCheckInDate] = useState('10月25日');
  const [checkOutDate, setCheckOutDate] = useState('10月26日');
  const [nights, setNights] = useState(1);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  useEffect(() => {
    const fetchDetail = async () => {
       if(!id) return;
       try {
         const res = await get(`/hotels/${id}`);
         setHotel(res);
         
         // Add to browsing history if logged in
         if (userInfo?.id) {
            await post('/history/add', { user_id: userInfo.id, hotel_id: id });
            
            // Check if favorited (need backend support, mock for now)
            const favRes = await get(`/favorites/list?user_id=${userInfo.id}`);
            // Check if current hotel is in the favorites list
            // Note: API returns array of hotel objects, check if any hotel.id matches current id
            const isFav = favRes.some((h: any) => String(h.id) === String(id));
            setIsFavorite(isFav);
         }
       } catch(e) {
         console.error(e);
         Toast.show({ content: '获取详情失败', icon: 'fail' });
       }
    }
    fetchDetail();
  }, [id, userInfo]);

  const toggleFavorite = async () => {
    if (!userInfo?.id) {
      Toast.show('请先登录');
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 1000);
      return;
    }

    try {
      if (isFavorite) {
        await post('/favorites/remove', { user_id: userInfo.id, hotel_id: id });
        setIsFavorite(false);
        Toast.show('已取消收藏');
      } else {
        await post('/favorites/add', { user_id: userInfo.id, hotel_id: id });
        setIsFavorite(true);
        Toast.show('收藏成功');
      }
    } catch (e) {
      Toast.show('操作失败');
    }
  };

  const handleBook = () => {
    if (!userInfo?.id) {
      Toast.show('请先登录');
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 1000);
      return;
    }

    if (selectedRoom === null) {
      Toast.show({ content: '请选择房型', icon: 'fail' });
      // document.querySelector('.pb-28')?.scrollIntoView({ behavior: 'smooth' }); // Taro H5 fix later
    } else {
       Taro.navigateTo({
          url: `/pages/order/create/index?hotelId=${id}&roomId=${selectedRoom}`
       })
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      // Note: window.scrollY might not work in Taro H5/MiniProgram consistently.
      // Better to use onPageScroll but that requires page configuration or hook.
      // Keeping original logic for now assuming H5 context.
      if (window.scrollY > 100) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const hotelImages = hotel?.images || [];
  const roomTypes = hotel?.rooms?.map((r: any) => ({
    id: r.id,
    name: r.name,
    tags: r.plans?.[0]?.name ? [r.plans[0].name] : [],
    features: [`${r.area}㎡`, `最多${r.max_guests}人`],
    price: r.plans?.[0]?.price || 999,
    originalPrice: r.plans?.[0]?.price ? Math.floor(r.plans[0].price * 1.2) : 1299,
    discount: '优惠价'
  })) || [];

  const handleDateChange = (param: any) => {
    // NutUI Calendar returns an array of dates for range selection
    if (param && param.length >= 2) {
      const start = new Date(param[0][3]);
      const end = new Date(param[1][3]);
      setCheckInDate(`${start.getMonth() + 1}月${start.getDate()}日`);
      setCheckOutDate(`${end.getMonth() + 1}月${end.getDate()}日`);
      // Calculate nights
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setNights(diffDays);
    }
    setShowCalendar(false);
  };

  const incrementGuests = () => {
    if (guests < 6) setGuests(guests + 1);
  };

  const decrementGuests = () => {
    if (guests > 1) setGuests(guests - 1);
  };

  const incrementRooms = () => {
    if (rooms < 5) setRooms(rooms + 1);
  };

  const decrementRooms = () => {
    if (rooms > 1) setRooms(rooms - 1);
  };

  return (
    <View className="relative w-full min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <View 
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 transition-all duration-300 ${
          isScrolled 
            ? 'bg-[#2C439B]/95 backdrop-blur-md shadow-md text-white' 
            : 'bg-transparent text-white'
        }`}
      >
        <View 
          className="flex items-center justify-center w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm active:scale-95 transition-transform" 
          onClick={() => Taro.navigateBack()}
        >
          <ArrowLeftOutlined className="text-white" />
        </View>
        
        <View className={`text-lg font-bold transition-opacity duration-300 ${isScrolled ? 'opacity-100' : 'opacity-0'}`}>
          {hotel?.name}
        </View>
        
        <View className="flex space-x-3">
          <View className="flex items-center justify-center w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm active:scale-95 transition-transform">
            <ShareAltOutlined className="text-white" />
          </View>
          <View 
            className="flex items-center justify-center w-8 h-8 rounded-full bg-black/20 backdrop-blur-sm active:scale-95 transition-transform"
            onClick={toggleFavorite}
          >
            {isFavorite ? (
              <HeartFilled className="text-[#DFA0C8]" />
            ) : (
              <HeartOutlined className="text-white" />
            )}
          </View>
        </View>
      </View>

      {/* Image Banner Carousel */}
      <View className="relative h-72 md:h-80">
        <Swiper
          modules={[Pagination, Navigation]}
          spaceBetween={0}
          slidesPerView={1}
          pagination={{ clickable: true }}
          className="h-full group"
        >
          {hotelImages.map((img, index) => (
            <SwiperSlide key={index}>
              <View className="relative h-full">
                <Image 
                  src={img} 
                  mode="aspectFill"
                  className="w-full h-full object-cover"
                />
                
                {/* Gradient overlay */}
                <View className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30"></View>
                
                {/* Rating badge */}
                <View className="absolute top-24 left-4 bg-white/90 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center space-x-1 shadow-lg transform transition-transform hover:scale-105">
                  <StarFilled className="text-[#33C7F7] text-xs" />
                  <Text className="text-[#25255F] text-xs font-bold">{hotel?.score}分 · {hotel?.review_count}条</Text>
                </View>
                
                {/* Official photo badge */}
                <View className="absolute bottom-6 left-4 bg-black/40 backdrop-blur-md rounded-full px-3 py-1 border border-white/20">
                  <Text className="text-white text-xs">官方图片</Text>
                </View>
              </View>
            </SwiperSlide>
          ))}
        </Swiper>
      </View>

      {/* Basic Info Card */}
      <View className="relative -mt-6 rounded-t-3xl bg-white px-5 pt-6 pb-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
        <View className="mb-4">
          <View className="flex items-start justify-between mb-2">
            <Text className="text-2xl font-bold text-[#25255F] leading-tight flex-1 mr-2">{hotel?.name}</Text>
            <View className="flex flex-col items-end space-y-1">
               <Text className="bg-[#33C7F7]/10 text-[#2C439B] text-[10px] px-2 py-0.5 rounded-full font-medium">{hotel?.brand}</Text>
            </View>
          </View>
          
          <View className="flex items-center mb-3">
            <View className="flex mr-2">
              <Rate readOnly value={hotel?.score || 5} size={12} activeColor="#33C7F7" />
            </View>
            <Text className="text-xs text-[#2C439B] font-medium bg-[#2C439B]/5 px-2 py-0.5 rounded">{hotel?.star_level}星级酒店</Text>
          </View>
          
          <View className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <View className="flex items-center text-sm text-[#25255F] flex-1 mr-4">
              <View className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm mr-2 flex-shrink-0">
                <EnvironmentOutlined className="text-[#33C7F7]" />
              </View>
              <Text className="truncate font-medium text-gray-700">{hotel?.address}</Text>
            </View>
            <View className="flex-shrink-0 text-[#33C7F7] bg-white px-3 py-1.5 rounded-full text-xs font-bold shadow-sm active:scale-95 transition-transform">
              地图
            </View>
          </View>
        </View>
        
        <View className="flex justify-around py-2 border-t border-gray-100">
          <View className="flex flex-col items-center text-[#25255F]/80">
            <CarOutlined className="text-[#33C7F7] text-lg mb-1" />
            <Text className="text-xs">免费停车</Text>
          </View>
          <View className="flex flex-col items-center text-[#25255F]/80">
            <BellOutlined className="text-[#33C7F7] text-lg mb-1" />
            <Text className="text-xs">自助入住</Text>
          </View>
          <View className="flex flex-col items-center text-[#25255F]/80">
            <CoffeeOutlined className="text-[#33C7F7] text-lg mb-1" />
            <Text className="text-xs">含早餐</Text>
          </View>
        </View>
      </View>

      {/* Calendar and Guests Card */}
      <View className="mx-4 mt-2 p-4 bg-gradient-to-r from-blue-50 to-white rounded-xl shadow-sm border border-blue-100">
        <View className="flex items-center justify-between">
          <View className="flex items-center flex-1">
            <View className="text-center mr-6">
              <View className="text-[#33C7F7] text-xs font-medium mb-1">入住</View>
              <Text className="text-[#25255F] font-bold text-lg leading-none">{checkInDate}</Text>
            </View>
            <View className="flex-1 flex flex-col items-center">
               <Text className="text-[#25255F]/50 text-xs bg-white px-2 py-0.5 rounded-full border border-gray-100 mb-1">{nights}晚</Text>
               <View className="w-full h-[1px] bg-gray-200 relative">
                 <View className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-gray-300 rounded-full"></View>
               </View>
            </View>
            <View className="text-center ml-6">
              <View className="text-[#2C439B] text-xs font-medium mb-1">离店</View>
              <Text className="text-[#25255F] font-bold text-lg leading-none">{checkOutDate}</Text>
            </View>
          </View>
          <View 
            className="ml-6 text-[#2C439B] text-sm font-bold flex items-center"
            onClick={() => setShowCalendar(true)}
          >
            修改 <Text className="ml-1">›</Text>
          </View>
        </View>
        <View className="mt-3 pt-3 border-t border-blue-100 flex items-center justify-between text-sm">
           <View className="flex items-center text-[#25255F] font-medium">
             <UserOutlined className="mr-2 text-[#33C7F7]" />
             <Text>{guests}人 · {rooms}间</Text>
           </View>
           <Text className="text-[#25255F]/40 text-xs">标准入住人数</Text>
        </View>
      </View>

      {/* Room Types List */}
      <View className="px-4 mt-6 space-y-4 pb-28">
        <Text className="text-lg font-bold text-[#25255F] mb-3 px-1">选择房型</Text>
        {roomTypes.map((room) => (
          <View 
            key={room.id} 
            className={`bg-white rounded-2xl shadow-[0_2px_15px_rgba(0,0,0,0.03)] overflow-hidden transition-all duration-300 border ${
              selectedRoom === room.id ? 'border-[#33C7F7] shadow-blue-100' : 'border-transparent'
            }`}
          >
            <View className="p-4">
              <View className="flex justify-between items-start mb-3">
                <View>
                   <Text className="text-[#25255F] font-bold text-lg mb-1">{room.name}</Text>
                   <View className="flex flex-wrap gap-2">
                    {room.tags.map((tag, idx) => (
                      <Tag 
                        key={idx} 
                        color={tag.includes('会员') || tag.includes('特价') ? '#DFA0C8' : '#33C7F7'}
                        background={tag.includes('会员') || tag.includes('特价') ? 'rgba(223, 160, 200, 0.1)' : 'rgba(51, 199, 247, 0.1)'}
                        textColor={tag.includes('会员') || tag.includes('特价') ? '#DFA0C8' : '#2C439B'}
                        round
                      >
                        {tag}
                      </Tag>
                    ))}
                   </View>
                </View>
              </View>
              
              <View className="flex flex-wrap gap-y-2 gap-x-4 mb-4 text-xs text-[#25255F]/70 bg-gray-50 p-3 rounded-lg">
                {room.features.map((feature, idx) => (
                  <View key={idx} className="flex items-center">
                    <CheckCircleFilled className="text-[#33C7F7] mr-1.5 text-xs" />
                    <Text>{feature}</Text>
                  </View>
                ))}
              </View>
              
              <View className="flex justify-between items-end">
                <View className="flex items-baseline">
                  <Text className="text-[#2C439B] text-2xl font-bold font-sans">¥{room.price}</Text>
                  {room.originalPrice && (
                    <Text className="ml-2 text-gray-400 line-through text-xs">
                      ¥{room.originalPrice}
                    </Text>
                  )}
                  <Text className="ml-2 bg-gradient-to-r from-[#DFA0C8] to-pink-400 text-white text-[10px] px-2 py-0.5 rounded-tl-lg rounded-br-lg transform -translate-y-1">
                    {room.discount}
                  </Text>
                </View>
                
                <Button 
                  className="!h-9 !rounded-full !px-5 !text-sm !font-bold !border-0"
                  style={{
                    background: selectedRoom === room.id ? '#2C439B' : 'linear-gradient(to right, #2C439B, #33C7F7)',
                    color: 'white',
                    boxShadow: '0 4px 6px -1px rgba(44, 67, 155, 0.2)'
                  }}
                  onClick={() => setSelectedRoom(room.id)}
                >
                  {selectedRoom === room.id ? '已选' : '预订'}
                </Button>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Bottom Action Bar */}
      <View className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
        <View className="flex items-center justify-between max-w-2xl mx-auto">
          <View>
            <Text className="text-xs text-[#25255F]/60 mb-1">
              {checkInDate} - {checkOutDate} · {nights}晚
            </Text>
            <View className="flex items-baseline">
              <Text className="text-xs text-[#2C439B] font-bold mr-0.5">¥</Text>
              <Text className="text-[#2C439B] text-2xl font-bold font-sans">{selectedRoom ? roomTypes.find(r => r.id === selectedRoom)?.price : roomTypes[0]?.price || 0}</Text>
              <Text className="text-xs text-[#25255F]/60 ml-1">起/晚</Text>
            </View>
          </View>
          <Button 
            className="!h-12 !rounded-full !px-8 !text-base !font-bold !border-0"
            style={{
              background: 'linear-gradient(to right, #2C439B, #33C7F7)',
              color: 'white',
              boxShadow: '0 4px 10px rgba(44, 67, 155, 0.2)'
            }}
            onClick={() => {
              if (!userInfo) {
                Toast.show('请先登录');
                setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500);
                return;
              }
              if (selectedRoom === null) {
                Toast.show({ content: '请选择房型', icon: 'fail' });
                document.querySelector('.pb-28')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                 Taro.navigateTo({
                    url: `/pages/order/create/index?hotelId=1&roomId=${selectedRoom}`
                 })
              }
            }}
          >
            立即预订
          </Button>
        </View>
      </View>

      {/* Calendar Modal */}
      <Calendar
        visible={showCalendar}
        type="range"
        startDate="2024-01-01"
        endDate="2025-12-31"
        onClose={() => setShowCalendar(false)}
        onConfirm={handleDateChange}
      />
    </View>
  );
};

export default App;
