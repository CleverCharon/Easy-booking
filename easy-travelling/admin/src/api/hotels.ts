import { request } from './request'

// 定义房型类型，与 API 返回的数据结构完全一致
export interface RoomTypeItem {
  id?: number
  name: string
  price: number
  description?: string | null  // ← 允许 null
  image_url?: string | null   // ← 允许 null
}

export interface HotelItem {
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
  roomTypes?: RoomTypeItem[]  // ← 新增房型字段，可选
}

// HotelDetail 直接继承，不需要重复声明
export interface HotelDetail extends HotelItem {
  // 不需要再写 roomTypes，已经继承过来了
  cancellation?: string | null  // 如果 cancellation 已经在 HotelItem 中定义了，这行也可以删除
}

export interface HotelCreateBody {
  name: string
  city: string
  address: string
  phone?: string
  price?: number | string
  star_level?: number | string
  tags?: string
  image_url?: string
  description?: string
  roomTypes: RoomTypeInput[]
}

export function getMyHotels() {
  return request<HotelItem[]>('/api/hotels/my')
}

export function createHotel(data: HotelCreateBody) {
  return request<{ success: boolean; message?: string; hotelId?: number }>('/api/hotels', {
    method: 'POST',
    body: data,
  })
}

export interface HotelDetail extends HotelItem {
  roomTypes: Array<{ id?: number; name: string; price: number; description?: string | null; image_url?: string | null }>
}

export function getHotelDetail(id: number) {
  return request<HotelDetail>(`/api/hotels/${id}`)
}


export function withdrawHotel(id: number) {
  return request<{ success: boolean; message?: string }>(`/api/hotels/${id}/status`, {
    method: 'PATCH',
    body: { status: 2 },
  })
}


export function deleteHotel(id: number) {
  return request<{ success: boolean; message?: string }>(`/api/hotels/${id}`, { method: 'DELETE' })
}

export function updateHotel(id: number, data: HotelCreateBody) {
  return request<{ success: boolean; message?: string }>(`/api/hotels/${id}`, {
    method: 'PUT',
    body: data,
  })
}
