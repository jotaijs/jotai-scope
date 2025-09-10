import { atom } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScope } from '../src/ScopeProvider/scope'
import { createDebugStore } from './utils'

describe('open issues', () => {
  // FIXME:
  it.skip('https://github.com/jotaijs/jotai-scope/issues/25', () => {
    const a = atom(
      vi.fn(() => {
        console.log('reading atomA')
      }),
      () => {}
    )
    a.debugLabel = 'atomA'
    a.onMount = vi.fn(() => {
      console.log('mounting atomA')
    })

    const s0 = createDebugStore()
    s0.sub(a, () => {
      console.log('S0: atomA changed')
    })

    const s1 = createScope({
      atomSet: new Set([a]),
      atomFamilySet: new Set(),
      parentStore: s0,
      name: 's1',
    })

    s1.sub(a, () => {
      console.log('S1: atomA changed')
    })

    expect(a.read).toHaveBeenCalledTimes(1)
    expect(a.onMount).toHaveBeenCalledTimes(1)
  })

  it('https://github.com/jotaijs/jotai-scope/issues/62', () => {
    const a = atom(0)
    a.debugLabel = 'atomA'

    const b = atom(null, (_, set, value: number) => {
      set(a, value)
    })
    b.debugLabel = 'atomB'

    const c = atom(null, (_, set, value: number) => {
      set(b, value)
    })
    c.debugLabel = 'atomC'

    function createStores() {
      const s0 = createDebugStore()
      s0.sub(a, () => {
        console.log('S1', s0.get(a))
      })

      const s1 = createScope({
        atomSet: new Set([a]),
        atomFamilySet: new Set(),
        parentStore: s0,
        name: 's1',
      })
      s1.sub(a, () => {
        console.log('S1', s1.get(a))
      })
      return { s0Store: s0, s1Store: s1 }
    }
    {
      const { s0Store, s1Store } = createStores()
      s1Store.set(c, 1)
      expect([s0Store.get(a), s1Store.get(a)] + '').toEqual('0,1')
    }
  })
})
