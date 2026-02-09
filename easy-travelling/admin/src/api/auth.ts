import { request, type ApiRes } from './request'

export interface RegisterParams {
  username: string
  password: string
  role: 'admin' | 'merchant'
}

export interface LoginParams {
  username: string
  password: string
}

export interface LoginRes extends ApiRes {
  token: string
  user: { id: number; username: string; role: string; avatar: string | null }
}

export function register(data: RegisterParams) {
  return request<ApiRes & { userId?: number }>('/api/auth/register', {
    method: 'POST',
    body: data,
  })
}

export function login(data: LoginParams) {
  return request<LoginRes>('/api/auth/login', {
    method: 'POST',
    body: data,
  })
}
