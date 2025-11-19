import { atom, createStore } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScope } from '../../src/ScopeProvider/scope'
import { createDebugStore, cross, printAtomState } from '../utils'
import dedent from 'dedent'

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
    S0[_]: a0, b0, c0(a0, b0)
    S1[a]: a1, b0, c1(a1, b0)
  */
  it.only('unscoped derived can change to dependent scoped and back', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(false)
    b.debugLabel = 'b'
    const c = atom(
      (get) => {
        if (get(b)) {
          return get(a)
        }
      },
      (_, set, v: number) => {
        set(c, v)
      }
    )
    c.debugLabel = 'c'
    const s0 = createDebugStore()
    const s1 = createScope({
      atoms: [a],
      parentStore: s0,
      name: 'S1',
    })
    cross([s0, s1], [a, b, c], (sx, ax) => sx.sub(ax, () => {}))
    function printScopes() {
      console.log('\n' + '-'.repeat(20) + '\n' + printAtomState(s0) + '\n')
    }
    printScopes()

    /*
    S0[_]: a0, b0, c0(a0, b0)
    S1[a]: a1, b0, c1(a1, b0)
  */
    expect(printAtomState(s0)).toBe(dedent`
      a: v=0
      b: v=false
      c: v=undefined
        b: v=false
      a@S1: v=0
      _c@S1: v=undefined
        c: v=undefined
          b: v=false
    `)
    s0.set(b, true) // changes a to dependent scoped
    expect(printAtomState(s0)).toBe(dedent`
      a: v=0
      b: v=true
      c: v=0
        b: v=true
        a: v=0
      a@S1: v=0
      _c@S1: v=0
        c@S1: v=0
          b: v=true
          a@S1: v=0
      c@S1: v=0
        a@S1: v=0
        b: v=true
    `)
    s0.set(c, 1)
    expect(printAtomState(s0)).toBe(dedent`
      a: v=1
      b: v=true
      c: v=1
        b: v=true
        a: v=1
      a@S1: v=0
      _c@S1: v=0
        c@S1: v=0
          b: v=true
          a@S1: v=0
      c@S1: v=0
        b: v=true
        a@S1: v=0
    `)
    s1.set(c, 2)
    expect(printAtomState(s0)).toBe(dedent`
      a: v=1
      b: v=true
      c: v=1
        b: v=true
        a: v=1
      a@S1: v=2
      _c@S1: v=2
        c@S1: v=2
          b: v=true
          a@S1: v=2
      c@S1: v=2
        b: v=true
        a@S1: v=2
    `)
    s1.set(b, false) // changes a back to unscoped
    expect(printAtomState(s0)).toBe(dedent`
      a: v=1
      b: v=false
      c: v=undefined
        b: v=false
      a@S1: v=2
      _c@S1: v=undefined
        c: v=undefined
          b: v=false
      c@S1: v=2
        a@S1: v=2
        b: v=false
    `)
  })
})
