import { getToken } from '../utils/auth'

/**
 * 请求基地址：开发时连接本地 Node 服务
 */
const BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

export interface ApiRes {
  success: boolean
  message?: string
  token?: string
  user?: { id: number; username: string; role: string; avatar: string | null }
  userId?: number
  [key: string]: unknown
}

const REQUEST_TIMEOUT = 15000

type RequestOptions = Omit<RequestInit, 'body'> & { body?: object }

export async function request<T = ApiRes>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options
  const token = getToken()
  const hasBody = body != null
  const headers: HeadersInit = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string>),
  }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${url}`, {
      ...rest,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw new Error('请求超时，请检查网络或稍后重试')
      throw new Error(err.message || '网络错误')
    }
    throw err
  }
  clearTimeout(timeoutId)
  const text = await res.text()
  let data: ApiRes | unknown = {}
  if (text) {
    try {
      data = JSON.parse(text) as ApiRes
    } catch {
      data = {}
    }
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data !== null && 'message' in data ? String((data as ApiRes).message) : `请求失败 ${res.status}`
    throw new Error(msg || `请求失败 ${res.status}`)
  }
  return (text ? (typeof data === 'object' && data !== null ? data : {}) : []) as T
}

/** 上传单张图片到 OSS，返回图片 URL（请求体为 FormData，不设 Content-Type） */
export async function uploadFile(file: File): Promise<{ success: boolean; url?: string; message?: string }> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; message?: string }
  if (!res.ok) throw new Error(data.message || `上传失败 ${res.status}`)
  return { success: !!data.success, url: data.url, message: data.message }
}
