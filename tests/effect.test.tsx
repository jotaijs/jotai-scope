import { act } from 'react'
import { render } from '@testing-library/react'
import { createStore, useAtomValue, useStore } from 'jotai'
import { atomWithReducer } from 'jotai/utils'
import type { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { atomEffect } from 'jotai-effect'
import { ScopeProvider } from 'jotai-scope'
// eslint-disable-next-line import/order
import { describe, expect, test, vi } from 'vitest'
import { createScopes, subscribeAll } from './utils'

describe('atomEffect', () => {
  /*
  FIXME:
    First Issue:
    In this test the atomEffect first runs as e0, and then when it reads a, it sees a0 and writes to a0.
    But we want it to be scoped as e1, and then when it reads a, it sees a1 and writes to a1.

    Second Issue:
    atomEffect.unstable_onInit gets called once for e0 and never called again. But the store param should be different for each scope.
  */
  test.only('should work with atomEffect', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a)
    })
    e.debugLabel = 'effect'
    const [s0, s1] = createScopes([a])
    subscribeAll([s1], [e, a])
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
    let s1: Store | undefined
    function Component() {
      s1 = useStore()
      useAtomValue(listener)
      useAtomValue(e)
      const v = useAtomValue(a)
      return <div className="value">{v}</div>
    }

    render(
      <ScopeProvider atoms={[a, b]} name="S1">
        <Component />
      </ScopeProvider>
    )
    expect(fn).toHaveBeenLastCalledWith(1)
    act(() => s1!.set(b))
    expect(fn).toHaveBeenLastCalledWith(2)
  })
})
