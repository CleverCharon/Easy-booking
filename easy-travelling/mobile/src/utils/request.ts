import Taro from '@tarojs/taro'

const BASE_URL = 'http://localhost:3000/api'
type RequestOptions = Omit<Taro.request.Option<any, any>, 'url'>

export const request = async (url: string, options: RequestOptions = {}) => {
  const fullUrl = `${BASE_URL}${url}`
  try {
    const { header, ...rest } = options
    const response = await Taro.request({
      ...rest,
      url: fullUrl,
      header: {
        'Content-Type': 'application/json',
        ...(header || {}),
      },
    })

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.data
    }

    const message = (response.data as any)?.message || '请求失败'
    Taro.showToast({
      title: String(message),
      icon: 'none',
    })
    throw new Error(String(message))
  } catch (error: any) {
    if (error?.message && error.message !== 'request:fail') {
      throw error
    }
    Taro.showToast({
      title: '网络错误',
      icon: 'none',
    })
    throw error
  }
}

export const get = (url: string, data?: any) => request(url, { method: 'GET', data })
export const post = (url: string, data?: any) => request(url, { method: 'POST', data })
export const put = (url: string, data?: any) => request(url, { method: 'PUT', data })
export const del = (url: string, data?: any) => request(url, { method: 'DELETE', data })
