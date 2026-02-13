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
      // 区分不同错误类型
      if (response.data.message && (
          response.data.message.includes('密码') || 
          response.data.message.includes('账号') ||
          response.data.message.includes('验证码') ||
          response.data.message.includes('短信')
      )) {
        Taro.showToast({
          title: response.data.message,
          icon: 'none'
        })
      } else {
        Taro.showToast({
          title: response.data.message || '请求失败',
          icon: 'none'
        })
      }
      throw new Error(response.data.message || '请求失败')
    }
  } catch (error: any) {
    console.error('Request Error:', error)
    
    // 如果已经是 Error 对象且有 message（通常是上面 throw 的业务错误），直接抛出，不再弹网络错误
    if (error.message && error.message !== 'request:fail') {
       throw error
    }

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
