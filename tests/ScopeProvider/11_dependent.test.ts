import dedent from 'dedent'
import { atom } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScopes, leftpad, printAtomState, printMountedMap, subscribeAll, trackAtomStateMap } from '../utils'
import chalk from 'chalk'
import {
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_Mounted as Mounted,
} from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import exp from 'constants'

describe('open issues', () => {
  // it('unscoped derived atom should not be recomputed when subscribed to in a child scope', () => {
  //   const a = atom(0)
  //   a.debugLabel = 'a'
  //   const b = atom(vi.fn())
  //   b.debugLabel = 'b'
  //   const s = createScopes([])
  //   subscribeAll(s, [a, b])
  //   expect(b.read).toHaveBeenCalledTimes(1)
  // })

  /*
    S0[_]: a0, b0, c0(a0 & b0)
    S1[b]: a0, b1, c0|c1(a0 & b1)
  */
  it.skip('unscoped derived can change to dependent scoped and back', () => {
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
    trackAtomStateMap(s[0])
    function printHeader(header: string, secondaryHeader?: string) {
      console.log(
        chalk.gray('-'.repeat(80)),
        `\n${chalk.yellow(header)} ${secondaryHeader ? `${secondaryHeader}` : ''}\n`,
        chalk.gray('-'.repeat(80))
      )
    }
    printHeader('subscribeAll(s, [a, b, c])')
    subscribeAll(s, [a, b, c])
    console.log(`AtomState`)
    console.log(leftpad(printAtomState.diff(s[0])))
    function printMountedDiff() {
      console.log(`MountedMap`)
      console.log(leftpad(printMountedMap.diff(s[0])))
    }
    printMountedDiff()

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
        a: v=unscoped_0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1)
    cReadCount.mockClear()

    printHeader("s[0].set(a, 'unscoped_1')", '_c@S1 recomputes but is still unscoped')
    s[0].set(a, 'unscoped_1') // _c@S1 recomputes but is still unscoped
    printMountedDiff()
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=unscoped_1
      b: v=0
      c: v=undefined
        a: v=unscoped_1
      b@S1: v=0
      _c@S1: v=undefined
        a: v=unscoped_1
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1)
    cReadCount.mockClear()

    printHeader("s[0].set(a, 'scoped_2')", 'c1 changes to dependent scoped')
    s[0].set(a, 'scoped_2') // c1 changes to dependent scoped
    printMountedDiff()
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=scoped_2
      b: v=0
      c: v=0
        a: v=scoped_2
        b: v=0
      b@S1: v=0
      _c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
      c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(2) // called for c0 and c1
    cReadCount.mockClear()

    printHeader('s[0].set(c, 1)', 'c0 writes to b0')
    s[0].set(c, 1) // c0 writes to b0
    printMountedDiff()
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=scoped_2
      b: v=1
      c: v=1
        a: v=scoped_2
        b: v=1
      b@S1: v=0
      _c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
      c@S1: v=0
        a: v=scoped_2
        b@S1: v=0
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1) // called for c0
    cReadCount.mockClear()

    printHeader('s[1].set(c, 2)', 'c1 is dependent scoped - so it writes to b1')
    s[1].set(c, 2) // c1 is dependent scoped - so it writes to b1
    printMountedDiff()
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=scoped_2
      b: v=1
      c: v=1
        a: v=scoped_2
        b: v=1
      b@S1: v=2
      _c@S1: v=2
        a: v=scoped_2
        b@S1: v=2
      c@S1: v=2
        a: v=scoped_2
        b@S1: v=2
    `)
    expect(cReadCount).toHaveBeenCalledTimes(1) // called for c1
    cReadCount.mockClear()

    printHeader("s[1].set(a, 'unscoped_3')", 'changes c1 back to unscoped')
    s[1].set(a, 'unscoped_3') // changes c1 back to unscoped
    printMountedDiff()
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=unscoped_3
      b: v=1
      c: v=undefined
        a: v=unscoped_3
      b@S1: v=2
      _c@S1: v=undefined
        a: v=unscoped_3
      c@S1: v=2
        a: v=scoped_2
        b@S1: v=2
    `)
    expect(cReadCount).toHaveBeenCalledTimes(2) // called for c0 and c1
    cReadCount.mockClear()
  })

  // TODO: Add more tests here for dependent scoped atoms and unscoped derived atoms
  // it.todo('unscoped derived can read dependent scoped atoms')
  // it.todo(
  //   'changing classification asynchronously is not allowed and should throw in dev mode'
  // )
  // it.todo('inherited dependent scoped atoms')

  /*
    S0[ ]: a0, b0, c0(a0 == true ? b0 : _)
    S1[b]: a0, b1, _c(a0 == true ? b1 : _)

    S0: subscriber0
    S1: subscriber1

    c is dependent scoped in S1 when it reads b.
  */
  it.skip('listeners are separate when derived is dependent scoped', () => {
    const a = atom(false)
    a.debugLabel = 'a'
    const b = atom('unscoped')
    b.debugLabel = 'b'
    const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
    c.debugLabel = 'c'

    const s = createScopes([b]) // b is explicitly scoped in S1
    s[1].set(b, 'scoped')

    const buildingBlocks = getBuildingBlocks(s[0])
    const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
    const storeHooks = buildingBlocks[6]
    const atomMountListener = vi.fn()
    const atomUnmountListener = vi.fn()
    storeHooks.m!.add(undefined, atomMountListener)
    storeHooks.u!.add(undefined, atomUnmountListener)

    // Subscribe in S0 and S1
    const unsub0 = s[0].sub(c, function listener0() {})
    const unsub1 = s[1].sub(c, function listener1() {})

    // Initially a=false, so c only reads a (not b)
    // c is unscoped: _c proxies to c0, both listeners on c0

    const proxyC = mountedMap.keys().find((a) => a.debugLabel === '_c')!
    if (!proxyC) throw new Error('atom_C not found')

    expect(mountedMap.get(c)?.l.size).toBe(2)
    expect(mountedMap.keys().find((a: AnyAtom) => a.debugLabel === 'c@S1')).toBe(undefined)
    expect(mountedMap.get(proxyC)).toBe(mountedMap.get(c))

    atomMountListener.mockClear()
    atomUnmountListener.mockClear()

    // c is dependent scoped in S1
    // reassign the listeners to their respective scoped atoms
    s[0].set(a, true)

    const c1 = mountedMap.keys().find((a) => a.debugLabel === 'c@S1')!
    if (!c1) throw new Error('c@S1 not found')

    expect(mountedMap.get(c)?.l.size).toBe(1)
    expect(mountedMap.get(c1)?.l.size).toBe(1)
    expect(mountedMap.get(proxyC)).toBe(mountedMap.get(c1))
    expect(atomMountListener).toHaveBeenCalledTimes(1)
    expect(atomMountListener).toHaveBeenCalledWith(c1)

    atomMountListener.mockClear()
    atomUnmountListener.mockClear()

    // Change a0 (unscoped a)
    s[0].set(a, false)
    expect(mountedMap.get(c)?.l.size).toBe(2)
    expect(mountedMap.get(c1)).toBe(undefined)
    expect(mountedMap.get(proxyC)).toBe(mountedMap.get(c))
    expect(atomUnmountListener).toHaveBeenCalledTimes(1)
    expect(atomUnmountListener).toHaveBeenCalledWith(c1)

    unsub0()
    expect(mountedMap.get(c)?.l.size).toBe(1)

    atomMountListener.mockClear()
    atomUnmountListener.mockClear()

    s[0].set(a, true) // c is dependent scoped in S1
    expect(mountedMap.get(c)).toBe(undefined)
    expect(mountedMap.get(c1)?.l.size).toBe(1)
    expect(atomUnmountListener).toHaveBeenCalledTimes(1)
    expect(atomUnmountListener).toHaveBeenCalledWith(c)
    expect(atomMountListener).toHaveBeenCalledTimes(1)
    expect(atomMountListener).toHaveBeenCalledWith(c1)

    atomMountListener.mockClear()
    atomUnmountListener.mockClear()

    s[0].set(a, false) // c is unscoped
    expect(mountedMap.get(c)?.l.size).toBe(1)
    expect(mountedMap.get(c1)).toBe(undefined)
    expect(atomUnmountListener).toHaveBeenCalledTimes(1)
    expect(atomUnmountListener).toHaveBeenCalledWith(c1)
    expect(atomMountListener).toHaveBeenCalledTimes(1)
    expect(atomMountListener).toHaveBeenCalledWith(c)

    unsub1()
  })
})
