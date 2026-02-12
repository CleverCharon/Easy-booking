import { create } from 'zustand'
import dayjs from 'dayjs'

interface SearchState {
  city: string
  startDate: string
  endDate: string
  keyword: string
  adults: number
  children: number
  roomCount: number
  minPrice: number
  maxPrice: number
  starLevels: string[]
  tags: string[]
  setCity: (city: string) => void
  setDates: (start: string, end: string) => void
  setKeyword: (keyword: string) => void
  setPeople: (adults: number, children: number, roomCount?: number) => void
  setPriceRange: (min: number, max: number) => void
  setStarLevels: (levels: string[]) => void
  setTags: (tags: string[]) => void
}

export const useSearchStore = create<SearchState>((set) => ({
  city: '广州',
  startDate: dayjs().format('YYYY-MM-DD'),
  endDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  keyword: '',
  adults: 2,
  children: 0,
  roomCount: 1,
  minPrice: 0,
  maxPrice: 10000, // 0-10000 means unlimited or max
  starLevels: [],
  tags: [],
  setCity: (city) => set({ city }),
  setDates: (startDate, endDate) => set({ startDate, endDate }),
  setKeyword: (keyword) => set({ keyword }),
  setPeople: (adults, children, roomCount = 1) => set({ adults, children, roomCount }),
  setPriceRange: (minPrice, maxPrice) => {
    console.log('Store: setPriceRange', minPrice, maxPrice)
    set({ minPrice, maxPrice })
  },
  setStarLevels: (starLevels) => {
    console.log('Store: setStarLevels', starLevels)
    set({ starLevels })
  },
  setTags: (tags) => set({ tags }),
}))
