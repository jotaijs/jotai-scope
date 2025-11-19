import { atom, createStore } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScope } from '../../src/ScopeProvider/scope'
import { createDebugStore, cross, printAtomState } from '../utils'
import dedent from 'dedent'
import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'

describe('open issues', () => {
  // FIXME:
  it('unscoped derived atom should not be recomputed when subscribed to in a child scope', () => {
    const a = atom(
      vi.fn(() => {
        console.log('a read')
      })
    )
    a.debugLabel = 'a'

    const s0 = createStore()
    s0.sub(a, () => {
      console.log('S0: a0 changed')
    })

    const s1 = createScope({
      atoms: [],
      parentStore: s0,
      name: 'S1',
    })

    s1.sub(a, () => {
      console.log('S1: a1 changed')
    })

    expect(a.read).toHaveBeenCalledTimes(1)
  })

  /*
    S0[_]: a0, b0, c0(a0 & b0)
    S1[b]: a0, b1, c0|c1(a0 & b1)
  */
  it.only('unscoped derived can change to dependent scoped and back', () => {
    const a = atom('unscoped_0')
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const cReadCount = vi.fn()
    const c = atom(
      (get) => {
        cReadCount()
        if (get(a).startsWith('scoped')) {
          return get(b)
        }
      },
      (_, set, v: number) => {
        set(b, v)
      }
    )
    c.debugLabel = 'c'
    const s0 = createDebugStore()
    const s1 = createScope({
      atoms: [b],
      parentStore: s0,
      name: 'S1',
    })
    cross([s0, s1], [a, b, c], (sx, ax) => sx.sub(ax, () => {}))

    /*
      S0[_]: a0, b0, c0(a0 & b0)
      S1[b]: a0, b1, c1(a0 & b1)
    */
    expect(printAtomState(s0)).toBe(dedent`
      a: v=unscoped_0
      b: v=0
      c: v=undefined
        a: v=unscoped_0
      b@S1: v=0
      _c@S1: v=undefined
        c: v=undefined
          a: v=unscoped_0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1)
    cReadCount.mockClear()

    s0.set(a, 'unscoped_1') // c@S1 recomputes but is still unscoped
    expect(printAtomState(s0)).toBe(dedent`
      a: v=unscoped_1
      b: v=0
      c: v=undefined
        a: v=unscoped_1
      b@S1: v=0
      _c@S1: v=undefined
        c: v=undefined
          a: v=unscoped_1
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1)
    cReadCount.mockClear()

    s0.set(a, 'scoped_2') // c1 changes to dependent scoped
    expect(printAtomState(s0)).toBe(dedent`
      a: v=scoped_2
      b: v=0
      c: v=0
        a: v=scoped_2
        b: v=0
      b@S1: v=0
      _c@S1: v=0
        c@S1: v=0
          a: v=scoped_2
          b@S1: v=0
      c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(2) // called once for c0 and once for c1
    cReadCount.mockClear()

    s0.set(c, 1) // c0 writes to b0
    expect(printAtomState(s0)).toBe(dedent`
      a: v=scoped_2
      b: v=1
      c: v=1
        a: v=scoped_2
        b: v=1
      b@S1: v=0
      _c@S1: v=0
        c@S1: v=0
          a: v=scoped_2
          b@S1: v=0
      c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1) // called for c0
    cReadCount.mockClear()

    s1.set(c, 2) // c1 is dependent scoped – so it writes to b1
    expect(printAtomState(s0)).toBe(dedent`
      a: v=scoped_2
      b: v=1
      c: v=1
        a: v=scoped_2
        b: v=1
      b@S1: v=2
      _c@S1: v=2
        c@S1: v=2
          a: v=scoped_2
          b@S1: v=2
      c@S1: v=2
        a: v=scoped_2
        b@S1: v=2
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1) // called for c1
    cReadCount.mockClear()

    s1.set(a, 'unscoped_3') // changes c1 back to unscoped
    expect(printAtomState(s0)).toBe(dedent`
      a: v=unscoped_3
      b: v=1
      c: v=undefined
        a: v=unscoped_3
      b@S1: v=2
      _c@S1: v=undefined
        c: v=undefined
          a: v=unscoped_3
      c@S1: v=2
        a: v=unscoped_3
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1) // called for c1
    cReadCount.mockClear()
  })
})
