import dedent from 'dedent'
import { atom, createStore } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScope } from '../../src/ScopeProvider/scope'
import {
  createDebugStore,
  createScopes,
  printAtomState,
  subscribeAll,
} from '../utils'

describe('open issues', () => {
  // FIXME:
  it('unscoped derived atom should not be recomputed when subscribed to in a child scope', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(vi.fn())
    b.debugLabel = 'b'
    const s = createScopes([])
    subscribeAll(s, [a, b])
    expect(b.read).toHaveBeenCalledTimes(1)
  })

  /*
    S0[_]: a0, b0, c0(a0 & b0)
    S1[b]: a0, b1, c0|c1(a0 & b1)
  */
  it('unscoped derived can change to dependent scoped and back', () => {
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
    const s = createScopes([b])
    subscribeAll(s, [a, b, c])

    /*
      S0[_]: a0, b0, c0(a0 & b0)
      S1[b]: a0, b1, c1(a0 & b1)
    */
    expect(printAtomState(s[0])).toBe(dedent`
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

    s[0].set(a, 'unscoped_1') // c@S1 recomputes but is still unscoped
    expect(printAtomState(s[0])).toBe(dedent`
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

    s[0].set(a, 'scoped_2') // c1 changes to dependent scoped
    expect(printAtomState(s[0])).toBe(dedent`
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
    expect(cReadCount).toHaveBeenCalledTimes(2) // called for c0 and c1
    cReadCount.mockClear()

    s[0].set(c, 1) // c0 writes to b0
    expect(printAtomState(s[0])).toBe(dedent`
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

    s[1].set(c, 2) // c1 is dependent scoped – so it writes to b1
    expect(printAtomState(s[0])).toBe(dedent`
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

    s[1].set(a, 'unscoped_3') // changes c1 back to unscoped
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=unscoped_3
      b: v=1
      c: v=undefined
        a: v=unscoped_3
      b@S1: v=2
      _c@S1: v=undefined
        c: v=undefined
          a: v=unscoped_3
      c@S1: v=undefined
        a: v=unscoped_3
    `)
    expect(cReadCount).toHaveBeenCalledTimes(2) // called for c0 and c1
    cReadCount.mockClear()
  })

  // TODO: Add more tests here for dependent scoped atoms and unscoped derived atoms
  it.todo('unscoped derived can read dependent scoped atoms')
  it.todo(
    'changing classification asynchronously is not allowed and should throw in dev mode'
  )
  it.todo('inherited dependent scoped atoms')
})
