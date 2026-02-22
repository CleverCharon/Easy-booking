import { request, type ApiRes } from './request'

export interface RegisterParams {
  username: string
  password: string
  role: 'admin' | 'merchant'
  phone: string
  smsCode: string
  /** 管理员：身份码；商户：邀请码（可空） */
  roleCode?: string
}

export interface LoginParams {
  username: string
  password: string
}

export interface LoginRes extends ApiRes {
  token: string
  user: { id: number; username: string; role: string; avatar: string | null }
}

export interface MeRes extends ApiRes {
  user: {
    id: number
    username: string
    role: string
    avatar: string | null
    phone: string | null
    created_at: string
    role_code: string | null
  }
}

export interface UpdateMeParams {
  username?: string
  avatar?: string | null
  password?: string
}

export function register(data: RegisterParams) {
  return request<ApiRes & { userId?: number }>('/api/auth/register', {
    method: 'POST',
    body: data,
  })
}

export function sendSmsCode(phone: string) {
  return request<ApiRes>('/api/auth/sms/send', {
    method: 'POST',
    body: { phone },
  })
}

export function login(data: LoginParams) {
  return request<LoginRes>('/api/auth/login', {
    method: 'POST',
    body: data,
  })
}

export function getMe() {
  return request<MeRes>('/api/auth/me')
}

export function updateMe(data: UpdateMeParams) {
  return request<MeRes>('/api/auth/me', {
    method: 'PATCH',
    body: data,
  })
}
