import Taro from '@tarojs/taro'

// 计算两个经纬度之间的距离 (Haversine formula)
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

const deg2rad = (deg: number) => {
  return deg * (Math.PI / 180)
}

export const getLocation = async (cities: any[]) => {
  try {
    console.log('Starting location service...')
    
    // 1. 获取用户当前坐标
    const res = await new Promise<Taro.getLocation.SuccessCallbackResult>((resolve, reject) => {
      Taro.getLocation({
        type: 'wgs84',
        success: (res) => {
          console.log('Taro.getLocation success:', res)
          resolve(res)
        },
        fail: (err) => {
          console.error('Taro.getLocation fail:', err)
          reject(err)
        }
      })
    })
    
    const { latitude, longitude } = res
    console.log('User Location:', latitude, longitude)
    
    // 2. 遍历城市列表，找到距离最近的城市
    let nearestCity = null
    let minDistance = Infinity
    
    cities.forEach(city => {
      if (city.lat && city.lng) {
        const distance = getDistance(latitude, longitude, Number(city.lat), Number(city.lng))
        console.log(`Distance to ${city.name}: ${distance}km`)
        if (distance < minDistance) {
          minDistance = distance
          nearestCity = city
        }
      }
    })
    
    // 暂时放宽限制，总是返回最近的城市，方便测试
    const result = nearestCity ? nearestCity.name : null
    console.log('Nearest city found:', result)
    return result
    
  } catch (error) {
    console.error('Location Error in getLocation:', error)
    // 模拟一个默认坐标（上海）用于测试，当在非HTTPS环境或拒绝权限时
    // 注意：实际生产环境应该抛出错误让用户处理
    console.warn('Falling back to mock location (Shanghai)')
    return '上海'
  }
}
