import { useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      // ignore corrupt storage
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota / private mode
    }
  }, [key, value])

  return [value, setValue] as const
}
