import { atomWithReducer } from 'jotai/utils'
import { atomEffect } from 'jotai-effect'
// eslint-disable-next-line import/order
import { describe, expect, test, vi } from 'vitest'
import { createScopes, subscribeAll } from '../utils'

describe('atomEffect', () => {
  /*
  FIXME:
    Issue:
    atomEffect.onInit is called with S1 store.
      ensureAtomState(s1, e) gives proxy atomState because S1.getAtom resolves the proxyAtom.
    
    We want proxyAtom to not have its own state. So should purely be a router.
    It calls atom read and write directly.

    _c is c or c@S1, NOT _c depends on c or c@S1.

    unscoped:
      ensureAtomState(Sx, _c@S1) -> ensureAtomState(S0, c)
      readAtomState(Sx, _c@S1) -> readAtomState(S0, c)
      onInit(Sx, _c@S1) -> onInit(S0, c)
      scope.getAtom(Sx, c) -> _c@S1

    scoped:
      ensureAtomState(Sx, _c@S1) -> ensureAtomState(S1, c@S1)
      readAtomState(Sx, _c@S1) -> readAtomState(S1, c@S1)
      onInit(Sx, _c@S1) -> onInit(S1, c@S1)
      scope.getAtom(Sx, c) -> _c@S1

    disallowed:
      scope.getAtom(Sx, _c@S1) -> throws

    S0[_]: a0, b0, c0(a0 & b0)
    S1[b]: a0, b1, c1(a0 & b1)

    stateMap
      a: v=unscoped_0
      b: v=0
      c: v=undefined
        a: v=unscoped_0
      b@S1: v=0
      _c@S1: v=undefined
        c: v=undefined
          a: v=unscoped_0

  */
  test.only('should work with atomEffect', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a)
    })
    e.debugLabel = 'effect'
    const [s0, s1] = createScopes([a])
    subscribeAll([s1], [a, e])
    expect(s1.get(a)).toBe(1)
    expect(s0.get(a)).toBe(0)
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
    const [_, s1] = createScopes([a, b])
    subscribeAll([s1], [listener, e, a])
    expect(fn).toHaveBeenLastCalledWith(1)
    s1.set(b)
    expect(fn).toHaveBeenLastCalledWith(2)
  })
})
