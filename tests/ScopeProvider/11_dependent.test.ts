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
import { storeScopeMap } from '../../src/ScopeProvider/scope'

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

  describe('scopeListenersMap', () => {
    it('tracks listeners subscribed in a scope', () => {
      const a = atom(0)
      a.debugLabel = 'a'

      const s = createScopes([a]) // a is explicitly scoped in S1
      const scope = storeScopeMap.get(s[1])!
      const scopeListenersMap = scope[8]

      // Initially no listeners
      expect(scopeListenersMap.get(a)).toBe(undefined)

      // Subscribe in S1
      const listener1 = vi.fn()
      const unsub1 = s[1].sub(a, listener1)

      // Listener should be tracked
      const listeners = scopeListenersMap.get(scope[0].get(a)![0])
      expect(listeners).toBeDefined()
      expect(listeners!.size).toBe(1)
      expect(listeners!.has(listener1)).toBe(true)

      // Subscribe another listener in S1
      const listener2 = vi.fn()
      const unsub2 = s[1].sub(a, listener2)

      expect(listeners!.size).toBe(2)
      expect(listeners!.has(listener2)).toBe(true)

      // Unsubscribe first listener
      unsub1()
      expect(listeners!.size).toBe(1)
      expect(listeners!.has(listener1)).toBe(false)
      expect(listeners!.has(listener2)).toBe(true)

      // Unsubscribe second listener - set should be cleaned up
      unsub2()
      expect(scopeListenersMap.get(scope[0].get(a)![0])).toBe(undefined)
    })

    it('tracks listeners separately per scope', () => {
      const a = atom(0)
      a.debugLabel = 'a'

      const s = createScopes([a]) // a is explicitly scoped in S1
      const scope0 = storeScopeMap.get(s[0])
      const scope1 = storeScopeMap.get(s[1])!
      const scopeListenersMap1 = scope1[8]

      // Subscribe in S0 - should NOT be tracked in S1's scopeListenersMap
      const listener0 = vi.fn()
      s[0].sub(a, listener0)

      // S0 doesn't have a scope (it's the base store)
      expect(scope0).toBe(undefined)

      // Subscribe in S1
      const listener1 = vi.fn()
      s[1].sub(a, listener1)

      // Only listener1 should be in S1's scopeListenersMap
      const scopedA = scope1[0].get(a)![0]
      const listeners1 = scopeListenersMap1.get(scopedA)
      expect(listeners1!.size).toBe(1)
      expect(listeners1!.has(listener1)).toBe(true)
      expect(listeners1!.has(listener0)).toBe(false)
    })

    it.skip('tracks listeners for derived atoms that become proxy atoms', () => {
      const a = atom(false)
      a.debugLabel = 'a'
      const b = atom(0)
      b.debugLabel = 'b'
      const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
      c.debugLabel = 'c'

      const s = createScopes([b]) // b is explicitly scoped in S1
      const scope1 = storeScopeMap.get(s[1])!
      const scopeListenersMap1 = scope1[8]

      // Subscribe to c in S1
      const listener1 = vi.fn()
      const unsub1 = s[1].sub(c, listener1)

      // c should have a proxy atom (_c) that is tracked
      // Find the proxy atom in the scopeListenersMap
      let proxyAtom: AnyAtom | undefined
      const buildingBlocks = getBuildingBlocks(s[0])
      const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
      for (const atom of mountedMap.keys()) {
        if (atom.debugLabel?.startsWith('_c')) {
          proxyAtom = atom
          break
        }
      }

      expect(proxyAtom).toBeDefined()
      const listeners = scopeListenersMap1.get(proxyAtom!)
      expect(listeners).toBeDefined()
      expect(listeners!.size).toBe(1)
      expect(listeners!.has(listener1)).toBe(true)

      // Unsubscribe
      unsub1()
      expect(scopeListenersMap1.get(proxyAtom!)).toBe(undefined)
    })

    it('derived atom with conditional dependency does not cause infinite loop', () => {
      const a = atom(false)
      a.debugLabel = 'a'
      const b = atom(0)
      b.debugLabel = 'b'
      const cRead = vi.fn((get: any) => (get(a) ? get(b) : 'unscoped'))
      const c = atom(cRead)
      c.debugLabel = 'c'

      const s = createScopes([b]) // b is explicitly scoped in S1

      // Just subscribe to c in S1
      const listener1 = vi.fn()
      const unsub1 = s[1].sub(c, listener1)

      // c.read should only be called a reasonable number of times (1-2)
      // If there's an infinite loop, this will be a very large number
      expect(cRead.mock.calls.length).toBeLessThan(10)
      expect(cRead.mock.calls.length).toBeGreaterThan(0)

      // Verify c's value is correct (a=false, so c returns 'unscoped')
      expect(s[1].get(c)).toBe('unscoped')

      unsub1()
    })
  })

  describe('listener transfer on classification change', () => {
    /*
      Setup for all tests:
      - a: primitive atom (unscoped), controls whether c reads b
      - b: primitive atom, explicitly scoped in S1
      - c: derived atom, reads b only when a=true

      When a=false: c is unscoped, _c proxies to c0
      When a=true: c is dependent scoped, _c points to c1
    */

    // Helper to get mounted map and scope info
    function getTestContext(s: ReturnType<typeof createScopes>) {
      const buildingBlocks = getBuildingBlocks(s[0])
      const atomStateMap = buildingBlocks[0] as Map<AnyAtom, any>
      const mountedMap = buildingBlocks[1] as Map<AnyAtom, Mounted>
      const storeHooks = buildingBlocks[6]
      const scope = storeScopeMap.get(s[1])!
      const scopeListenersMap = scope[8]
      return { atomStateMap, mountedMap, storeHooks, scope, scopeListenersMap }
    }

    // Helper to get proxy atom (_c@S1)
    function getProxyAtom(s: ReturnType<typeof createScopes>, originalAtom: AnyAtom): AnyAtom {
      const { atomStateMap } = getTestContext(s)
      const proxyLabel = `_${originalAtom.debugLabel}@S1`
      const proxy = [...atomStateMap.keys()].find((at: AnyAtom) => at.debugLabel === proxyLabel)
      if (!proxy) {
        throw new Error(
          `Proxy atom ${proxyLabel} not found. Available: ${[...atomStateMap.keys()].map((a: AnyAtom) => a.debugLabel).join(', ')}`
        )
      }
      return proxy
    }

    // Helper to get scoped atom (c@S1)
    function getScopedAtom(s: ReturnType<typeof createScopes>, originalAtom: AnyAtom): AnyAtom {
      const { atomStateMap } = getTestContext(s)
      const scopedLabel = `${originalAtom.debugLabel}@S1`
      const scoped = [...atomStateMap.keys()].find((at: AnyAtom) => at.debugLabel === scopedLabel)
      if (!scoped) {
        throw new Error(
          `Scoped atom ${scopedLabel} not found. Available: ${[...atomStateMap.keys()].map((a: AnyAtom) => a.debugLabel).join(', ')}`
        )
      }
      return scoped
    }

    describe('hook-based mounting', () => {
      it('mounting proxyAtom mounts toAtom', () => {
        const a = atom('initial')
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => get(a))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        // Subscribe to proxy - this creates and mounts the proxy
        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        // Get proxy atom after subscribe
        const proxyAtom = getProxyAtom(s, c)

        // proxyAtom should be mounted
        expect(mountedMap.get(proxyAtom)).toBeDefined()
        // toAtom (c, since unscoped) should also be mounted
        expect(mountedMap.get(c)).toBeDefined()

        unsub()
      })

      it('proxyAtom.mounted aliases toAtom.mounted', () => {
        const a = atom('initial')
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => get(a))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        const proxyAtom = getProxyAtom(s, c)
        const proxyMounted = mountedMap.get(proxyAtom)
        const toMounted = mountedMap.get(c)

        // They should be the same object
        expect(proxyMounted).toBe(toMounted)

        unsub()
      })

      it('proxyAtom is added to dependency mounted.t', () => {
        const a = atom('initial')
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => get(a))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        const proxyAtom = getProxyAtom(s, c)
        const aMounted = mountedMap.get(a)

        // proxyAtom should be in a's dependents
        expect(aMounted).toBeDefined()
        expect([...aMounted!.t]).toContain(proxyAtom)

        unsub()
      })

      it('listener is notified when dependency changes', () => {
        const a = atom('initial')
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => get(a))
        c.debugLabel = 'c'

        const s = createScopes([b])

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        expect(listener).not.toHaveBeenCalled()

        s[0].set(a, 'changed')

        expect(listener).toHaveBeenCalledTimes(1)
        expect(s[1].get(c)).toBe('changed')

        unsub()
      })
    })

    describe('hook teardown on classification change', () => {
      it('old toAtom hook is removed when classification changes', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom('scoped')
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        // Initially unscoped - c is toAtom
        expect(mountedMap.get(c)).toBeDefined()

        // Trigger classification change to scoped
        s[0].set(a, true)

        // Now scopedAtom (c@S1) is toAtom
        const scopedAtom = getScopedAtom(s, c)
        expect(mountedMap.get(scopedAtom)).toBeDefined()

        // proxyAtom.mounted should now alias scopedAtom.mounted
        const proxyAtom = getProxyAtom(s, c)
        expect(mountedMap.get(proxyAtom)).toBe(mountedMap.get(scopedAtom))

        unsub()
      })

      it('new toAtom hook is set up when classification changes', () => {
        const a = atom(true) // start scoped
        a.debugLabel = 'a'
        const b = atom('scoped')
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)

        // Initially scoped
        const scopedAtom = getScopedAtom(s, c)
        const proxyAtom = getProxyAtom(s, c)
        expect(mountedMap.get(proxyAtom)).toBe(mountedMap.get(scopedAtom))

        // Trigger classification change to unscoped
        s[0].set(a, false)

        // proxyAtom.mounted should now alias c.mounted (original)
        expect(mountedMap.get(proxyAtom)).toBe(mountedMap.get(c))

        unsub()
      })

      it('listener notifications work after classification change', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom('scoped-value')
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])

        const listener = vi.fn()
        const unsub = s[1].sub(c, listener)
        listener.mockClear()

        // Change to scoped
        s[0].set(a, true)
        expect(listener).toHaveBeenCalled()
        expect(s[1].get(c)).toBe('scoped-value')
        listener.mockClear()

        // Change scoped dependency - listener should be notified
        s[1].set(b, 'new-scoped-value')
        expect(listener).toHaveBeenCalled()
        expect(s[1].get(c)).toBe('new-scoped-value')
        listener.mockClear()

        // Change back to unscoped
        s[0].set(a, false)
        expect(listener).toHaveBeenCalled()
        expect(s[1].get(c)).toBe('unscoped')

        unsub()
      })
    })

    describe('scopedAtom deps issue', () => {
      it('scopedAtom should depend on b@S1, not b', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom('value')
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const buildingBlocks = getBuildingBlocks(s[0])
        const atomStateMap = buildingBlocks[0]

        // Subscribe to c in S1 - this creates proxyAtom (_c@S1)
        const unsub = s[1].sub(c, () => {})

        // Transition to scoped by setting a=true
        s[0].set(a, true)

        // Now c@S1 (scopedAtom) should be read and its deps should include b@S1
        // Find c@S1 in atomStateMap
        let scopedAtom: AnyAtom | undefined
        ;(atomStateMap as any).forEach((_: any, atom: any) => {
          if (atom.debugLabel === 'c@S1') {
            scopedAtom = atom
          }
        })

        expect(scopedAtom).toBeDefined()
        const scopedAtomState = atomStateMap.get(scopedAtom!)
        expect(scopedAtomState).toBeDefined()

        // Check deps - should be [a, b@S1] not [a, b]
        const deps = [...scopedAtomState!.d.keys()]
        const depLabels = deps.map((d: any) => d.debugLabel)

        // b@S1 should be in deps, not b
        expect(depLabels).toContain('b@S1')
        expect(depLabels).not.toContain('b')

        unsub()
      })
    })

    describe('classification change direction', () => {
      it.skip('scoped → unscoped: moves S1 listeners from c1 to c0', () => {
        const a = atom(true) // Start scoped
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        // Initially scoped: listener on c1
        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(c1).toBeDefined()
        expect(mountedMap.get(c1!)?.l.size).toBe(1)

        // Transition to unscoped
        s[0].set(a, false)

        // Listener should have moved to c0
        expect(mountedMap.get(c)?.l.size).toBe(1)
        expect(mountedMap.get(c1!)).toBeUndefined() // c1 unmounted

        unsub1()
      })
    })

    describe('listener distribution before transition', () => {
      it.skip('no listeners: transitions without error', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])

        // Just read c without subscribing
        expect(s[1].get(c)).toBe('unscoped')

        // Transition should work without error
        s[0].set(a, true)
        expect(s[1].get(c)).toBe(0)

        s[0].set(a, false)
        expect(s[1].get(c)).toBe('unscoped')
      })

      it.skip('listeners only in S0: S0 listeners stay on c0', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener0 = vi.fn()
        const unsub0 = s[0].sub(c, listener0)

        // S0 listener on c0
        expect(mountedMap.get(c)?.l.size).toBe(1)

        // Transition to scoped - S0 listener stays on c0
        s[0].set(a, true)
        expect(mountedMap.get(c)?.l.size).toBe(1)

        // Transition back - still on c0
        s[0].set(a, false)
        expect(mountedMap.get(c)?.l.size).toBe(1)

        unsub0()
      })

      it.skip('listeners only in S1: S1 listeners move with classification', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        // Initially on c0
        expect(mountedMap.get(c)?.l.size).toBe(1)

        // Transition to scoped - moves to c1
        s[0].set(a, true)
        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(mountedMap.get(c1!)?.l.size).toBe(1)
        expect(mountedMap.get(c)?.l).toBeUndefined() // c0 unmounted

        // Transition back - moves to c0
        s[0].set(a, false)
        expect(mountedMap.get(c)?.l.size).toBe(1)
        expect(mountedMap.get(c1!)).toBeUndefined() // c1 unmounted

        unsub1()
      })

      it.skip('listeners in both S0 and S1: each stays with correct atom', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener0 = vi.fn()
        const listener1 = vi.fn()
        const unsub0 = s[0].sub(c, listener0)
        const unsub1 = s[1].sub(c, listener1)

        // Both on c0 initially
        expect(mountedMap.get(c)?.l.size).toBe(2)

        // Transition: S0 stays on c0, S1 moves to c1
        s[0].set(a, true)
        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(mountedMap.get(c)?.l.size).toBe(1)
        expect(mountedMap.get(c1!)?.l.size).toBe(1)

        // Transition back: S1 moves back to c0
        s[0].set(a, false)
        expect(mountedMap.get(c)?.l.size).toBe(2)
        expect(mountedMap.get(c1!)).toBeUndefined()

        unsub0()
        unsub1()
      })
    })

    describe('mount/unmount lifecycle', () => {
      it.skip('c1 is mounted when transitioning to scoped with S1 listeners', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap, storeHooks } = getTestContext(s)

        const mountListener = vi.fn()
        storeHooks.m!.add(undefined, mountListener)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)
        mountListener.mockClear()

        // Transition to scoped - c1 should be mounted
        s[0].set(a, true)

        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(mountListener).toHaveBeenCalledWith(c1)

        unsub1()
      })

      it.skip('c1 is unmounted when transitioning to unscoped', () => {
        const a = atom(true) // Start scoped
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap, storeHooks } = getTestContext(s)

        const unmountListener = vi.fn()
        storeHooks.u!.add(undefined, unmountListener)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        unmountListener.mockClear()

        // Transition to unscoped - c1 should be unmounted
        s[0].set(a, false)

        expect(unmountListener).toHaveBeenCalledWith(c1)

        unsub1()
      })

      it.skip('c0 is unmounted when only S1 listeners exist and transitioning to scoped', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { storeHooks } = getTestContext(s)

        const unmountListener = vi.fn()
        storeHooks.u!.add(undefined, unmountListener)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)
        unmountListener.mockClear()

        // Transition to scoped - c0 should be unmounted (no S0 listeners)
        s[0].set(a, true)

        expect(unmountListener).toHaveBeenCalledWith(c)

        unsub1()
      })

      it.skip('c0 stays mounted when S0 listeners exist and transitioning to scoped', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap, storeHooks } = getTestContext(s)

        const unmountListener = vi.fn()
        storeHooks.u!.add(undefined, unmountListener)

        const listener0 = vi.fn()
        const listener1 = vi.fn()
        const unsub0 = s[0].sub(c, listener0)
        const unsub1 = s[1].sub(c, listener1)
        unmountListener.mockClear()

        // Transition to scoped - c0 should stay mounted (S0 listener exists)
        s[0].set(a, true)

        expect(unmountListener).not.toHaveBeenCalledWith(c)
        expect(mountedMap.get(c)?.l.size).toBe(1)

        unsub0()
        unsub1()
      })
    })

    describe('onMount/onUnmount callbacks', () => {
      it.skip('c1.onMount is called when first listener arrives on c1', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const onMount = vi.fn(() => vi.fn())
        // Use a writable derived atom so we can attach onMount
        const c = atom(
          (get) => (get(a) ? get(b) : 'unscoped'),
          () => {} // dummy write
        )
        c.debugLabel = 'c'
        c.onMount = onMount

        const s = createScopes([b])

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)
        onMount.mockClear()

        // Transition to scoped - c1 gets listener, onMount should be called
        s[0].set(a, true)

        expect(onMount).toHaveBeenCalledTimes(1)

        unsub1()
      })

      it.skip('c1.onUnmount is called when last listener leaves c1', () => {
        const a = atom(true) // Start scoped
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const onUnmount = vi.fn()
        // Use a writable derived atom so we can attach onMount
        const c = atom(
          (get) => (get(a) ? get(b) : 'unscoped'),
          () => {} // dummy write
        )
        c.debugLabel = 'c'
        c.onMount = () => onUnmount

        const s = createScopes([b])

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)
        onUnmount.mockClear()

        // Transition to unscoped - c1 loses listener, onUnmount should be called
        s[0].set(a, false)

        expect(onUnmount).toHaveBeenCalledTimes(1)

        unsub1()
      })
    })

    describe('multiple listeners', () => {
      it.skip('all S1 listeners are moved together', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener1a = vi.fn()
        const listener1b = vi.fn()
        const listener1c = vi.fn()
        const unsub1a = s[1].sub(c, listener1a)
        const unsub1b = s[1].sub(c, listener1b)
        const unsub1c = s[1].sub(c, listener1c)

        // All 3 on c0
        expect(mountedMap.get(c)?.l.size).toBe(3)

        // Transition - all 3 move to c1
        s[0].set(a, true)
        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(mountedMap.get(c1!)?.l.size).toBe(3)

        unsub1a()
        unsub1b()
        unsub1c()
      })
    })

    describe('repeated transitions', () => {
      it.skip('state is consistent after multiple back-and-forth transitions', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener0 = vi.fn()
        const listener1 = vi.fn()
        const unsub0 = s[0].sub(c, listener0)
        const unsub1 = s[1].sub(c, listener1)

        // Multiple transitions
        for (let i = 0; i < 5; i++) {
          // To scoped
          s[0].set(a, true)
          const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
          expect(mountedMap.get(c)?.l.size).toBe(1)
          expect(mountedMap.get(c1!)?.l.size).toBe(1)

          // To unscoped
          s[0].set(a, false)
          expect(mountedMap.get(c)?.l.size).toBe(2)
        }

        unsub0()
        unsub1()
      })
    })

    describe('listener notifications after transfer', () => {
      it.skip('S1 listener is notified of changes to b1 after transition to scoped', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)
        listener1.mockClear()

        // Transition to scoped
        s[0].set(a, true)
        listener1.mockClear()

        // Change b in S1 - listener should be notified
        s[1].set(b, 42)
        expect(listener1).toHaveBeenCalled()

        unsub1()
      })

      it.skip('S1 listener is notified of changes to a after transition to unscoped', () => {
        const a = atom(true) // Start scoped
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        // Transition to unscoped
        s[0].set(a, false)
        listener1.mockClear()

        // Change a - listener should be notified (c depends on a)
        s[0].set(a, false) // Set to same value to trigger notification
        // Actually need to change value
        s[0].set(a, true) // back to scoped
        s[0].set(a, false) // back to unscoped
        // This is getting complex - let's simplify

        unsub1()
      })

      it.skip('S0 listener continues to work after S1 transitions', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])

        const listener0 = vi.fn()
        const listener1 = vi.fn()
        const unsub0 = s[0].sub(c, listener0)
        const unsub1 = s[1].sub(c, listener1)

        // Transition to scoped
        s[0].set(a, true)
        listener0.mockClear()

        // Change b in S0 - S0 listener should be notified
        s[0].set(b, 42)
        expect(listener0).toHaveBeenCalled()

        unsub0()
        unsub1()
      })
    })

    describe('proxy atom identity', () => {
      it.skip('_c.mounted aliases to c0.mounted when unscoped', () => {
        const a = atom(false)
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        const proxyC = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === '_c@S1')
        expect(proxyC).toBeDefined()
        expect(mountedMap.get(proxyC!)).toBe(mountedMap.get(c))

        unsub1()
      })

      it.skip('_c.mounted aliases to c1.mounted when scoped', () => {
        const a = atom(true) // Start scoped
        a.debugLabel = 'a'
        const b = atom(0)
        b.debugLabel = 'b'
        const c = atom((get) => (get(a) ? get(b) : 'unscoped'))
        c.debugLabel = 'c'

        const s = createScopes([b])
        const { mountedMap } = getTestContext(s)

        const listener1 = vi.fn()
        const unsub1 = s[1].sub(c, listener1)

        const proxyC = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === '_c@S1')
        const c1 = [...mountedMap.keys()].find((a: AnyAtom) => a.debugLabel === 'c@S1')
        expect(proxyC).toBeDefined()
        expect(c1).toBeDefined()
        expect(mountedMap.get(proxyC!)).toBe(mountedMap.get(c1!))

        unsub1()
      })
    })
  })

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
