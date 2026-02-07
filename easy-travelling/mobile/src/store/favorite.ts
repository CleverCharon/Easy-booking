import { create } from 'zustand'

export interface Hotel {
  id: string
  name: string
  image: string
  score: number
  price: number
  tags: string[]
  location?: string
}

interface FavoriteState {
  favorites: Hotel[]
  history: Hotel[]
  addFavorite: (hotel: Hotel) => void
  removeFavorite: (hotelId: string) => void
  isFavorite: (hotelId: string) => boolean
  addToHistory: (hotel: Hotel) => void
  clearHistory: () => void
  clearFavorites: () => void // For management
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favorites: [],
  history: [],
  addFavorite: (hotel) => {
    const { favorites } = get()
    if (!favorites.find(h => h.id === hotel.id)) {
      set({ favorites: [...favorites, hotel] })
    }
  },
  removeFavorite: (hotelId) => {
    set({ favorites: get().favorites.filter(h => h.id !== hotelId) })
  },
  isFavorite: (hotelId) => {
    return !!get().favorites.find(h => h.id === hotelId)
  },
  addToHistory: (hotel) => {
    const { history } = get()
    const newHistory = [hotel, ...history.filter(h => h.id !== hotel.id)].slice(0, 20) // Limit to 20
    set({ history: newHistory })
  },
  clearHistory: () => set({ history: [] }),
  clearFavorites: () => set({ favorites: [] }),
}))
