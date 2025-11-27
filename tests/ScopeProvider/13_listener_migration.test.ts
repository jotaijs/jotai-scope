import { atom } from 'jotai'
import { describe, expect, it, vi } from 'vitest'
import { createScopes, subscribeAll } from '../utils'

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
    // - a: primitive atom that controls whether c reads b
    // - b: explicitly scoped in S1
    // - c: derived atom, initially unscoped (doesn't read b), then becomes scoped (reads b)
    const a = atom('unscoped')
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const cReadCount = vi.fn()
    const c = atom((get) => {
      cReadCount()
      console.log('c read:', get(a))
      if (get(a) === 'scoped') {
        return get(b)
      }
      return 'no-b'
    })
    c.debugLabel = 'c'

    const s = createScopes([b])
    const [s0, s1] = s

    // Subscribe to all atoms in all scopes to initialize them
    subscribeAll(s, [a, b, c])
    console.log('after subscribeAll')

    // Add a specific listener to c in S1
    const listener = vi.fn(() =>
      console.log('listener called! callCount:', listener.mock.calls.length + 1)
    )
    const unsub = s1.sub(c, listener)
    console.log(
      'after s1.sub(c), listener callCount:',
      listener.mock.calls.length
    )
    listener.mockClear()
    cReadCount.mockClear()

    // At this point c is unscoped (doesn't read b)
    // Verify that changing b in S1 does NOT notify c's listener
    console.log('setting b to 1')
    s1.set(b, 1)
    expect(listener).not.toHaveBeenCalled() // c doesn't depend on b yet
    listener.mockClear()

    // Change a to 'scoped' - this should cause c to read b, making c dependent-scoped
    console.log('setting a to scoped')
    s0.set(a, 'scoped')

    // After classification change:
    // - c's proxy atom now points to scopedAtom instead of originalAtom
    // - The listener should have been notified of the change
    console.log('checking listener after a=scoped')
    expect(listener).toHaveBeenCalled()
    listener.mockClear()

    // Now when we set b in S1, c should be notified (listener is now on scopedAtom)
    console.log('setting b to 2')
    console.log('before set, s1.get(b):', s1.get(b), 's0.get(b):', s0.get(b))
    console.log('before set, s1.get(c):', s1.get(c))
    s1.set(b, 2)
    console.log('after set, s1.get(b):', s1.get(b), 's0.get(b):', s0.get(b))
    console.log('after set, s1.get(c):', s1.get(c))
    console.log('checking listener after b=2')
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
      return 'no-b'
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
      return 'no-b'
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
    expect(listener1).toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()
    listener1.mockClear()
    listener2.mockClear()

    // Both listeners should be notified when b changes (now scoped)
    s1.set(b, 1)
    expect(listener1).toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()

    // Unsubscribe one listener
    unsub1()
    listener2.mockClear()

    // Change back to unscoped - only listener2 should be notified
    s0.set(a, 'unscoped')
    expect(listener2).toHaveBeenCalled()
    listener2.mockClear()

    // When b changes, listener2 should NOT be notified (c is unscoped)
    s1.set(b, 2)
    expect(listener2).not.toHaveBeenCalled()

    // Change to scoped again - listener2 should be notified
    s0.set(a, 'scoped')
    expect(listener2).toHaveBeenCalled()
    listener2.mockClear()

    // Now b changes should notify listener2 again
    s1.set(b, 3)
    expect(listener2).toHaveBeenCalled()

    unsub2()
  })
})
