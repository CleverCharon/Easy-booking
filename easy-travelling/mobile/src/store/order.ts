import { create } from 'zustand'

export interface Order {
  id: string
  hotelId: string
  hotelName: string
  hotelImage: string
  roomName: string
  checkIn: string
  checkOut: string
  nights: number
  price: number
  status: 'pending' | 'paid' | 'cancelled' | 'completed'
  guestName: string
  guestPhone: string
  createTime: number
}

interface OrderState {
  orders: Order[]
  addOrder: (order: Order) => void
  updateOrderStatus: (id: string, status: Order['status']) => void
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
  updateOrderStatus: (id, status) => set((state) => ({
    orders: state.orders.map((o) => (o.id === id ? { ...o, status } : o))
  }))
}))
