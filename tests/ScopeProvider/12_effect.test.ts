import { atomWithReducer } from 'jotai/utils'
import { atomEffect } from 'jotai-effect'
import { describe, expect, test, vi } from 'vitest'
import { createScopes, subscribeAll } from '../utils'

describe('atomEffect', () => {
  /*
    S0[_]: a0, b0, c0(a0 & b0)
    S1[b]: a0, b1, c1(a0 & b1)

    stateMap
      a: v=unscoped_0
      b: v=0
      c: v=undefined
        a: v=unscoped_0
      b@S1: v=0
  */
  test('should work with atomEffect', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a)
    })
    e.debugLabel = 'effect'
    /**```
      S0[_]: a0, b0, c0(a0 & b0)
      S1[a]: a1, :ref, e(:ref, a1)
    */
    const [s0, s1] = createScopes([a])
    subscribeAll([s1], [a, e])
    expect(s1.get(a)).toBe(1)
    expect(s0.get(a)).toBe(0)
  })

  /*
    S0[___]: a0, b0, c(a0), e0(a0, b0)
    S1[a,b]: a1, b1, c(a1), e1(a1, b1)

    stateMap
      a: v=unscoped_0
      b: v=0
      c: v=undefined
        a: v=unscoped_0
      b@S1: v=0
  */
  test('should work with atomEffect in a scope', async () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'a'
    const b = atomWithReducer(0, (v) => v + 1)
    b.debugLabel = 'b'
    const fn = vi.fn()
    const c = atomEffect((get) => {
      fn(get(a))
    })
    c.debugLabel = 'c'
    const e = atomEffect((get, set) => {
      get(b)
      set(a)
    })
    e.debugLabel = 'e'
    const [_, s1] = createScopes([a, b])
    subscribeAll([s1], [a, b, c, e])
    // c is called on mount, and again when e calls set(a)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(1)
    fn.mockClear()
    s1.set(b)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith(2)
    expect(s1.get(a)).toBe(2)
  })
})
