import { useCallback, useRef, useState, type MutableRefObject } from 'react'

/** Sync React dirty state with a ref used by poll/refresh guards. */
export function useExplicitSaveFlag() {
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setDirty(true)
  }, [])

  const clearDirty = useCallback(() => {
    dirtyRef.current = false
    setDirty(false)
  }, [])

  const setDirtyState = useCallback((next: boolean) => {
    dirtyRef.current = next
    setDirty(next)
  }, [])

  return { dirty, dirtyRef, markDirty, clearDirty, setDirtyState }
}

export function anyDirty(...refs: MutableRefObject<boolean>[]): boolean {
  return refs.some((r) => r.current)
}
