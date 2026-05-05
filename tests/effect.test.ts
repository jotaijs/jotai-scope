import { createStore } from 'jotai'
import { atomWithReducer } from 'jotai/utils'
import { atomEffect } from 'jotai-effect'
import { createScope } from 'jotai-scope'
// eslint-disable-next-line import/order
import { describe, expect, test, vi } from 'vitest'

describe('atomEffect', () => {
  test('should work with atomEffect', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a)
    })
    e.debugLabel = 'effect'
    const s0 = createStore()
    const s1 = createScope({ atoms: [a], parentStore: s0, name: 's1' })
    s1.sub(e, () => {})
    s1.sub(a, () => {})
    expect(s0.get(a)).toBe(0)
    expect(s1.get(a)).toBe(1)
  })

  test('should work with atomEffect in a scope', async () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const b = atomWithReducer(0, (v) => v + 1)
    b.debugLabel = 'atomB'
    const fn = vi.fn()
    const listener = atomEffect((get) => {
      fn(get(a))
    })
    listener.debugLabel = 'listener'
    const e = atomEffect((get, set) => {
      get(b)
      set(a)
    })
    e.debugLabel = 'effect'
    const s0 = createStore()
    const s1 = createScope({ atoms: [a, b], parentStore: s0, name: 's1' })
    s1.sub(listener, () => {})
    s1.sub(e, () => {})
    s1.sub(a, () => {})
    expect(fn).toHaveBeenLastCalledWith(1)
    s1.set(b)
    expect(fn).toHaveBeenLastCalledWith(2)
  })
})
