import { atomWithReducer } from 'jotai/utils'
import { Store } from 'jotai/vanilla/store'
import { atomEffect } from 'jotai-effect'
import { describe, expect, test, vi } from 'vitest'
import { AnyAtom } from 'src/types'
import { createScopes, getStoreName, subscribeAll } from '../utils'

describe('atomEffect', () => {
  /*
    S0[_]: a0, b0, c0(a0 & b0)
    S1[a]: a1, e:ref, e(e:ref, a1)

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
    const eOnInit = vi.fn(e.INTERNAL_onInit)
    e.INTERNAL_onInit = eOnInit
    e.debugLabel = 'effect'
    /**```
      S0[_]: a0, b0, c0(a0 & b0)
      S1[a]: a1, :ref, e(:ref, a1)
    */
    const [s0, s1] = createScopes([a])
    subscribeAll([s1], [a, e])
    expect('' + eOnInit.mock.calls.flat().map(getStoreName)).toEqual('S1')
    expect('' + s0.get(a) + s1.get(a)).toBe('01')
  })

  test('should work with atomEffect first initialized in base store', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a)
    })
    e.INTERNAL_onInit = vi.fn(e.INTERNAL_onInit)
    e.debugLabel = 'effect'
    /**```
      S0[_]: a0, b0, c0(a0 & b0)
      S1[a]: a1, :ref, e(:ref, a1)
    */
    const [s0, s1] = createScopes([a])
    s0.get(e)
    subscribeAll([s1], [a, e])
    expect(e.INTERNAL_onInit).toHaveBeenCalledTimes(2)
    expect(e.INTERNAL_onInit).toHaveBeenCalledWith(s1)
    expect('' + s0.get(a) + s1.get(a)).toBe('01')
  })

  /*
    S0[___]: a0, b0, c0(a0), e0(a0, b0)
    S1[a,b]: a1, b1, c1(a1), e1(a1, b1)

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
    const cRead = vi.fn()
    const c = atomEffect((get) => {
      cRead(get(a))
    })
    const cINTERNAL_onInit = c.INTERNAL_onInit!
    const cOnInit = vi.fn()
    c.INTERNAL_onInit = function (this: AnyAtom, store: Store) {
      cOnInit(this.debugLabel, getStoreName(store))
      cINTERNAL_onInit(store)
    }
    c.debugLabel = 'c'
    const e = atomEffect((get, set) => {
      get(b)
      set(a)
    })
    const eINTERNAL_onInit = e.INTERNAL_onInit!
    const eOnInit = vi.fn()
    e.INTERNAL_onInit = function (this: AnyAtom, store: Store) {
      eOnInit(this.debugLabel, getStoreName(store))
      eINTERNAL_onInit(store)
    }
    e.debugLabel = 'e'
    /**```
      S0[___]: a0, b0, c0(a0), e0(a0, b0)
      S1[a,b]: a1, b1, c1(a1), e1(a1, b1)
    */
    const [_, s1] = createScopes([a, b])
    subscribeAll([s1], [a, b, c, e])
    const print = (o: object) => JSON.stringify(o).replace(/^\[|\]$|"/g, '')
    expect(print(cOnInit.mock.calls)).toBe('[c1,S1]')
    expect(print(eOnInit.mock.calls)).toBe('[e1,S1]')
    // c is called on mount, and again when e calls set(a)
    expect('' + cRead.mock.calls).toBe('0,1')
    cRead.mockClear()
    s1.set(b)
    expect('' + cRead.mock.calls).toBe('2')
    expect(s1.get(a)).toBe(2)
  })
})
