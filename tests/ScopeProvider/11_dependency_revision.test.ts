import type { Atom } from 'jotai'
import { atom, createStore } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { createScope } from 'jotai-scope'
// eslint-disable-next-line import/order
import { describe, expect, it, vi } from 'vitest'
import type { INTERNAL_Store as Store } from '../../src/jotai-compat'
import { K, INTERNAL_getBuildingBlocks as getBuildingBlocks } from '../../src/jotai-compat'

type AnyAtom = Atom<unknown>

function inspect(store: Store) {
  const buildingBlocks = getBuildingBlocks(store)
  const atomStateMap = buildingBlocks[K.atomStateMap]
  const mountedMap = buildingBlocks[K.mountedMap]
  return {
    atomState: (a: AnyAtom) => atomStateMap.get(a) as { k?: number; d: Map<AnyAtom, number> },
    mounted: (a: AnyAtom) => mountedMap.get(a) as { k?: number; d: Set<AnyAtom>; l: Set<() => void> } | undefined,
  }
}

describe('dependency revision in scopes', () => {
  it('reconciles dependency changes inside a scope', () => {
    const useB = atom(false)
    const a = atom('a')
    const b = atom('b')
    const derived = atom((get) => (get(useB) ? get(b) : get(a)))
    const s0 = createStore()
    const s1 = createScope({ atoms: [useB, a, b], parentStore: s0, name: 's1' })
    const listener = vi.fn()
    s1.sub(derived, listener)
    s1.set(useB, true)
    expect(s1.get(derived)).toBe('b')
    s1.set(b, 'b2')
    expect(s1.get(derived)).toBe('b2')
    expect(listener).toHaveBeenCalledTimes(2)
    s1.set(a, 'a2')
    expect(listener).toHaveBeenCalledTimes(2)
    expect(s0.get(derived)).toBe('a')
  })

  it('reconciles dependency changes between nested scopes', () => {
    const useB = atom(false)
    const a = atom('a')
    const b = atom('b')
    const derived = atom((get) => (get(useB) ? get(b) : get(a)))
    const s0 = createStore()
    const s1 = createScope({ atoms: [b], parentStore: s0, name: 's1' })
    const s2 = createScope({ atoms: [useB], parentStore: s1, name: 's2' })
    s2.sub(derived, () => {})
    s2.set(useB, true)
    s2.set(b, 'b2')
    expect(s2.get(derived)).toBe('b2')
    expect(s1.get(b)).toBe('b2')
    expect(s0.get(b)).toBe('b')
    expect(s0.get(derived)).toBe('a')
  })

  it('reconciles an equal-value dependency switch made by an eager read in a scope', () => {
    const base = atom(1)
    const derived = atom((get) => (get(atom((get) => get(base))) > 10 ? 'big' : 'small'))
    const w = atom(null, (get, set) => {
      set(base, 2)
      expect(get(derived)).toBe('small')
    })
    const s0 = createStore()
    const s1 = createScope({ atoms: [base], parentStore: s0, name: 's1' })
    s1.sub(derived, () => {})
    s1.set(w)
    s1.set(base, 20)
    expect(s1.get(derived)).toBe('big')
    expect(s0.get(derived)).toBe('small')
  })

  it('unmounts the final dependency of a scoped atom', () => {
    const base = atom(1)
    const onUnmount = vi.fn()
    base.onMount = () => onUnmount
    let useBase = true
    const derived = atom((get) => (useBase ? get(base) : 0))
    const s0 = createStore()
    const s1 = createScope({ atoms: [base], parentStore: s0, name: 's1' })
    s1.sub(derived, () => {})
    useBase = false
    s1.set(base, 2)
    expect(s1.get(derived)).toBe(0)
    expect(onUnmount).toHaveBeenCalledOnce()
  })

  it('keeps atomState.k and mounted.k in sync through the scope', () => {
    const useB = atom(false)
    const a = atom(0)
    const b = atom(0)
    const derived = atom((get) => (get(useB) ? get(b) : get(a)))
    const s0 = createStore()
    const s1 = createScope({ atoms: [useB, a, b], parentStore: s0, name: 's1' })
    const { atomState, mounted } = inspect(s1)
    s1.sub(derived, () => {})
    const k = atomState(derived).k!
    expect(mounted(derived)!.k).toBe(k)
    s1.set(useB, true)
    expect(atomState(derived).k).toBe(k + 2)
    expect(mounted(derived)!.k).toBe(k + 2)
    mounted(derived)!.k = k
    expect(mounted(derived)!.k).toBe(k)
    const state = atomState(derived)
    ++state.k!
    expect(atomState(derived).k).toBe(k + 3)
  })

  it('returns the current mounted state after a scoped atom is remounted', () => {
    const a = atom(0)
    const derived = atom((get) => get(a))
    const s0 = createStore()
    const s1 = createScope({ atoms: [a], parentStore: s0, name: 's1' })
    const { mounted } = inspect(s1)
    const unsub = s1.sub(derived, () => {})
    const first = mounted(derived)
    expect(mounted(derived)).toBe(first)
    expect(first!.l.size).toBe(1)
    unsub()
    expect(mounted(derived)).toBeUndefined()
    const listener = vi.fn()
    s1.sub(derived, listener)
    const second = mounted(derived)
    expect(second).not.toBe(first)
    expect(second!.l.size).toBe(1)
    s1.set(a, 1)
    expect(listener).toHaveBeenCalledOnce()
    expect(s1.get(derived)).toBe(1)
  })

  it('runs atomEffect inside a scope when its dependency switches', () => {
    const useB = atom(false)
    const a = atom(0)
    const b = atom(0)
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => {
      effect(get(useB) ? get(b) : get(a))
    })
    const s0 = createStore()
    const s1 = createScope({ atoms: [useB, a, b], parentStore: s0, name: 's1' })
    s1.sub(effectAtom, () => {})
    s1.set(useB, true)
    s1.set(b, 1)
    expect(effect).toHaveBeenLastCalledWith(1)
    s0.set(b, 2)
    expect(effect).toHaveBeenLastCalledWith(1)
  })

  it('cleans up effect subscriptions in nested scopes exactly once', () => {
    const a = atom(0)
    const cleanup = vi.fn()
    const effect = vi.fn()
    const effectAtom = atomEffect((get) => {
      effect(get(a))
      return cleanup
    })
    const s0 = createStore()
    const s1 = createScope({ atoms: [a], parentStore: s0, name: 's1' })
    const s2 = createScope({ atoms: [a], parentStore: s1, name: 's2' })
    const unsub1 = s1.sub(effectAtom, () => {})
    const unsub2 = s2.sub(effectAtom, () => {})
    s2.set(a, 1)
    expect(effect).toHaveBeenLastCalledWith(1)
    cleanup.mockClear()
    unsub2()
    expect(cleanup).toHaveBeenCalledOnce()
    s2.set(a, 2)
    expect(effect).toHaveBeenCalledTimes(3)
    unsub1()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})
