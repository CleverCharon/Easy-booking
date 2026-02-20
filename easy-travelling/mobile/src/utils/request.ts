import Taro from '@tarojs/taro'

const BASE_URL = 'http://localhost:3000/api'

/**
 * 标准 HTTP 请求封装函数
 * 统一处理通用请求头、错误解析及 UI 反馈。
 * 
 * @param url - API 接口路径 (例如：'/user/login')
 * @param options - Taro 请求配置选项
 * @returns {Promise<any>} 响应数据
 */
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
      // 处理业务逻辑错误
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
    
    // 如果是已知错误（已在上方处理），直接抛出，避免重复弹窗
    if (error.message && error.message !== 'request:fail') {
       throw error
    }

    // 处理网络层级错误
    Taro.showToast({
      title: '网络错误',
      icon: 'none'
    })
    throw error
  }
}

/**
 * GET 请求快捷方法
 */
export const get = (url: string, data?: any) => request(url, { method: 'GET', data })

/**
 * POST 请求快捷方法
 */
export const post = (url: string, data?: any) => request(url, { method: 'POST', data })

/**
 * PUT 请求快捷方法
 */
export const put = (url: string, data?: any) => request(url, { method: 'PUT', data })

/**
 * DELETE 请求快捷方法
 */
export const del = (url: string, data?: any) => request(url, { method: 'DELETE', data })
