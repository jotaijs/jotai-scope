import { atom, createStore } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createPatchedStore } from '../src/ScopeProvider/patchedStore'
import { createScope } from '../src/ScopeProvider/scope'

describe('open issues', () => {
  // FIXME:
  it.fails('https://github.com/jotaijs/jotai-scope/issues/25', () => {
    const a = atom(vi.fn(), () => {})
    a.debugLabel = 'atomA'
    a.onMount = vi.fn()

    const s0 = createStore()
    s0.sub(a, () => {
      console.log('S0: atomA changed')
    })

    const s1 = createPatchedStore(
      s0,
      createScope(
        ...(Object.values({
          atoms: new Set([a]),
          atomFamilies: new Set(),
          parentScope: undefined,
          scopeName: 's1',
        }) as Parameters<typeof createScope>)
      )
    )

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
      const s0Store = createStore()
      s0Store.sub(a, () => {
        console.log('S1', s0Store.get(a))
      })

      const s1Store = createPatchedStore(
        s0Store,
        createScope(
          ...(Object.values({
            atoms: new Set([a]),
            atomFamilies: new Set(),
            parentScope: undefined,
            scopeName: 's1',
          }) as Parameters<typeof createScope>)
        )
      )
      s1Store.sub(a, () => {
        console.log('S1', s1Store.get(a))
      })
      return { s0Store, s1Store }
    }
    {
      const { s0Store, s1Store } = createStores()
      s1Store.set(c, 1)
      expect([s0Store.get(a), s1Store.get(a)] + '').toEqual('0,1')
    }
  })
})
