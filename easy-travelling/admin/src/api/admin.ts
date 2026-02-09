import { request } from './request'
import type { HotelDetail } from './hotels'

export interface AdminHotelItem {
  id: number
  merchant_id: number
  name: string
  city: string
  address: string
  phone: string | null
  price: number | null
  star_level: number | null
  tags: string | null
  image_url: string | null
  description: string | null
  status: number
  cancellation?: string | null
  create_time: string
  update_time?: string | null
  /** 已发布列表会返回，来自 sys_users.username */
  merchant_name?: string | null
}

export interface AdminPendingHotelItem extends AdminHotelItem {
  merchant_name: string | null
}

/** 获取已发布酒店列表（禁用缓存并带时间戳，保证下线等操作后表格显示最新 update_time） */
export function getPublishedHotels() {
  return request<AdminHotelItem[]>(`/api/admin/hotels/published?_=${Date.now()}`, { cache: 'no-store' })
}

export function getPendingHotels() {
  return request<AdminPendingHotelItem[]>('/api/admin/hotels/pending')
}

export function getAdminHotelDetail(id: number) {
  return request<HotelDetail>(`/api/admin/hotels/${id}`)
}

export function approveHotel(id: number) {
  return request<{ success: boolean; message?: string }>(`/api/admin/hotels/${id}/approve`, { method: 'POST' })
}

export function rejectHotel(id: number, reason: string) {
  return request<{ success: boolean; message?: string }>(`/api/admin/hotels/${id}/reject`, {
    method: 'POST',
    body: { reason },
  })
}

export function offlineHotel(id: number, reason: string) {
  return request<{ success: boolean; message?: string }>(`/api/admin/hotels/${id}/offline`, {
    method: 'POST',
    body: { reason },
  })
}

export function deleteHotelAdmin(id: number) {
  return request<{ success: boolean; message?: string }>(`/api/admin/hotels/${id}`, { method: 'DELETE' })
}
