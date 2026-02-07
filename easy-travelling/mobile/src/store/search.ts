import { create } from 'zustand'
import dayjs from 'dayjs'

interface SearchState {
  city: string
  startDate: string
  endDate: string
  keyword: string
  adults: number
  children: number
  tags: string[]
  setCity: (city: string) => void
  setDates: (start: string, end: string) => void
  setKeyword: (keyword: string) => void
  setPeople: (adults: number, children: number) => void
  setTags: (tags: string[]) => void
}

export const useSearchStore = create<SearchState>((set) => ({
  city: '广州',
  startDate: dayjs().format('YYYY-MM-DD'),
  endDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  keyword: '',
  adults: 2,
  children: 0,
  tags: [],
  setCity: (city) => set({ city }),
  setDates: (startDate, endDate) => set({ startDate, endDate }),
  setKeyword: (keyword) => set({ keyword }),
  setPeople: (adults, children) => set({ adults, children }),
  setTags: (tags) => set({ tags }),
}))
