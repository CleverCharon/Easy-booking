import Taro from '@tarojs/taro'

const BASE_URL = 'http://localhost:3000/api'

export const request = async (url: string, options: Taro.request.Option = {}) => {
  try {
    const response = await Taro.request({
      url: `${BASE_URL}${url}`,
      ...options,
      header: {
        'Content-Type': 'application/json',
        ...options.header
      }
    })

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.data
    } else {
      Taro.showToast({
        title: response.data.message || '请求失败',
        icon: 'none'
      })
      throw new Error(response.data.message || '请求失败')
    }
  } catch (error) {
    console.error('Request Error:', error)
    Taro.showToast({
      title: '网络错误',
      icon: 'none'
    })
    throw error
  }
}

export const get = (url: string, data?: any) => request(url, { method: 'GET', data })
export const post = (url: string, data?: any) => request(url, { method: 'POST', data })
export const put = (url: string, data?: any) => request(url, { method: 'PUT', data })
export const del = (url: string, data?: any) => request(url, { method: 'DELETE', data })
