import dedent from 'dedent'
import { atom } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import {
  createScopes,
  printAtomState,
  printAtomStateDiff,
  printHeader,
  printMountedDiff,
  printMountedMap,
  subscribeAll,
} from '../utils'

describe('listener migration', () => {
  /**
   * When subscribing to a proxy atom that is initially unscoped,
   * and then a dependency change causes it to become scoped,
   * the listeners should move from originalAtom.mounted.l to scopedAtom.mounted.l.
   *
   * This is verified by checking that:
   * 1. The listener is notified when classification changes
   * 2. The listener is notified when the scoped dependency changes
   */
  it('moves listeners from originalAtom to scopedAtom when classification changes to scoped', () => {
    // Setup:
    // - a: boolean atom that controls whether c reads b (true = scoped, false = unscoped)
    // - b: explicitly scoped in S1
    // - c: derived atom, initially unscoped (a=false, doesn't read b), then becomes scoped (a=true, reads b)
    const a = atom(false)
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const cReadCount = vi.fn()
    const c = atom((get) => {
      cReadCount()
      if (get(a)) {
        return get(b)
      }
      return -1
    })
    c.debugLabel = 'c'

    /**```
      S0[_]: a0, b0, c0(a0)
      S1[b]: a0, b1, c_(a0 ? c1(a0 + b1) : c0(a0))
     */
    const s = createScopes([b])
    const [s0, s1] = s

    printHeader('subscribeAll(s, [a, b, c])')
    subscribeAll(s, [a, b, c])
    printAtomStateDiff(s)
    printMountedDiff(s)
    expect(printAtomState(s0)).toBe(dedent`
      a: v=false
      b: v=0
      c: v=-1
        a: v=false
      b1: v=0
    `)
    expect(printMountedMap(s0)).toBe(dedent`
      a: l=a$S0,a$S1 d=[] t=c
      b: l=b$S0 d=[] t=[]
      c: l=c$S0,c$S1 d=a t=[]
      b1: l=b$S1 d=[] t=[]
    `)

    printHeader('subscribe to c in S1')
    const listener = vi.fn()
    const unsub = s1.sub(c, listener)
    printAtomStateDiff(s)
    printMountedDiff(s)
    listener.mockClear()
    cReadCount.mockClear()
    expect(printAtomState(s0)).toBe(dedent`
      a: v=false
      b: v=0
      c: v=-1
        a: v=false
      b1: v=0
    `)
    expect(printMountedMap(s0)).toBe(dedent`
      a: l=a$S0,a$S1 d=[] t=c
      b: l=b$S0 d=[] t=[]
      c: l=c$S0,c$S1,spy d=a t=[]
      b1: l=b$S1 d=[] t=[]
    `)

    printHeader('s1.set(b, 1)', 'set b1 while unscoped')
    s1.set(b, 1)
    printAtomStateDiff(s)
    printMountedDiff(s)
    expect(listener).not.toHaveBeenCalled() // c doesn't depend on b yet
    listener.mockClear()
    expect(printAtomState(s0)).toBe(dedent`
      a: v=false
      b: v=0
      c: v=-1
        a: v=false
      b1: v=1
    `)
    expect(printMountedMap(s0)).toBe(dedent`
      a: l=a$S0,a$S1 d=[] t=c
      b: l=b$S0 d=[] t=[]
      c: l=c$S0,c$S1,spy d=a t=[]
      b1: l=b$S1 d=[] t=[]
    `)

    printHeader('s0.set(a, true)', 'c becomes scoped because it now reads b')
    s0.set(a, true)
    printAtomStateDiff(s)
    printMountedDiff(s)
    expect(printAtomState(s0)).toBe(dedent`
      a: v=true
      b: v=0
      c: v=0
        a: v=true
        b: v=0
      b1: v=1
      c1: v=1
        a: v=true
        b1: v=1
    `)
    expect(printMountedMap(s0)).toBe(dedent`
      a: l=a$S0,a$S1 d=[] t=c,c1
      b: l=b$S0 d=[] t=c
      c: l=c$S0 d=a,b t=[]
      b1: l=b$S1 d=[] t=c1
      c1: l=c$S1,spy d=a,b1 t=[]
    `)

    // After classification change:
    // - c's proxy atom now points to scopedAtom instead of originalAtom
    // - The listener should have been notified of the change (value changed from -1 to 1)
    expect(listener).toHaveBeenCalled() // FIXME: AssertionError: expected "spy" to be called at least once
    listener.mockClear()

    // Section 5: Set b=2 (c should be notified since listener is now on scopedAtom)
    printHeader('s1.set(b, 2)', 'c should be notified')
    s1.set(b, 2)
    printAtomStateDiff(s)
    printMountedDiff(s)
    expect(printAtomState(s0)).toBe(dedent`
      a: v=true
      b: v=0
      c: v=0
        a: v=true
        b: v=0
      b1: v=2
      c1: v=2
        a: v=true
        b1: v=2
    `)
    expect(printMountedMap(s0)).toBe(dedent`
      a: l=a$S0,a$S1 d=[] t=c,c1
      b: l=b$S0 d=[] t=c
      c: l=c$S0 d=a,b t=[]
      b1: l=b$S1 d=[] t=c1
      c1: l=c$S1,spy d=a,b1 t=[]
    `)
    expect(listener).toHaveBeenCalled()

    unsub()
  })

  it('moves listeners from scopedAtom to originalAtom when classification changes to unscoped', () => {
    // Setup similar to above, but start with c reading b (scoped), then stop reading b
    const a = atom('scoped')
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const c = atom((get) => {
      if (get(a) === 'scoped') {
        return get(b)
      }
      return -1
    })
    c.debugLabel = 'c'

    const s = createScopes([b])
    const [s0, s1] = s

    // Subscribe to all atoms in all scopes to initialize them
    subscribeAll(s, [a, b, c])

    // Add a specific listener to c in S1
    const listener = vi.fn()
    const unsub = s1.sub(c, listener)
    listener.mockClear()

    // c is initially scoped (reads b)
    // Verify c is notified when b changes
    s1.set(b, 1)
    expect(listener).toHaveBeenCalled()
    listener.mockClear()

    // Change a to 'unscoped' - this should cause c to stop reading b, making c unscoped
    s0.set(a, 'unscoped')

    // The listener should have been notified of the change
    expect(listener).toHaveBeenCalled()
    listener.mockClear()

    // Now when we set b in S1, c should NOT be notified (it no longer depends on b)
    s1.set(b, 2)
    expect(listener).not.toHaveBeenCalled()

    unsub()
  })

  it('tracks multiple listeners correctly through classification changes', () => {
    const a = atom('unscoped')
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const c = atom((get) => {
      if (get(a) === 'scoped') {
        return get(b)
      }
      return -1
    })
    c.debugLabel = 'c'

    const s = createScopes([b])
    const [s0, s1] = s

    // Subscribe to all atoms in all scopes to initialize them
    subscribeAll(s, [a, b, c])

    const listener1 = vi.fn()
    const listener2 = vi.fn()

    // Subscribe two additional listeners to c in S1
    const unsub1 = s1.sub(c, listener1)
    const unsub2 = s1.sub(c, listener2)
    listener1.mockClear()
    listener2.mockClear()

    // Change to scoped - both listeners should be notified
    s0.set(a, 'scoped')
    expect(listener1).toHaveBeenCalledOnce()
    expect(listener2).toHaveBeenCalledOnce()
    listener1.mockClear()
    listener2.mockClear()

    // Both listeners should be notified when b changes (now scoped)
    s1.set(b, 1)
    expect(listener1).toHaveBeenCalledOnce()
    expect(listener2).toHaveBeenCalledOnce()

    // Unsubscribe one listener
    unsub1()
    listener2.mockClear()

    // Change back to unscoped - only listener2 should be notified
    s0.set(a, 'unscoped')
    expect(listener2).toHaveBeenCalledOnce()
    listener2.mockClear()

    // When b changes, listener2 should NOT be notified (c is unscoped)
    s1.set(b, 2)
    expect(listener2).not.toHaveBeenCalledOnce()

    // Change to scoped again - listener2 should be notified
    s0.set(a, 'scoped')
    expect(listener2).toHaveBeenCalledOnce()
    listener2.mockClear()

    // Now b changes should notify listener2 again
    s1.set(b, 3)
    expect(listener2).toHaveBeenCalledOnce()

    unsub2()
  })
})
