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
      atoms: [a],
      parentStore: s0,
      name: 's1',
    })

    s1.sub(a, () => {
      console.log('S1: atomA changed')
    })

    expect(a.read).toHaveBeenCalledTimes(1)
    expect(a.onMount).toHaveBeenCalledTimes(1)
  })
})
