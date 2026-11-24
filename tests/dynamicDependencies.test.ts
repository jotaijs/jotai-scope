import type { Atom } from 'jotai'
import { atom, createStore } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { createScope } from 'jotai-scope'
// eslint-disable-next-line import/order
import { expect, it, vi } from 'vitest'
import { K, INTERNAL_getBuildingBlocks as getBuildingBlocks } from '../src/jotai-compat'

it('keeps scoped dynamic dependencies and effects consistent across eager reads and remounts', () => {
  const base = atom(1)
  const intermediates: Atom<number>[] = []
  const derived = atom((get) => {
    const intermediate = atom((get) => get(base))
    intermediates.push(intermediate)
    return get(intermediate) > 10 ? 'big' : 'small'
  })
  const eagerWrite = atom(null, (get, set) => {
    set(base, 2)
    expect(get(derived)).toBe('small')
  })
  const run = vi.fn()
  const cleanup = vi.fn()
  const effectAtom = atomEffect((get) => {
    run(get(derived))
    return cleanup
  })

  const s0 = createStore()
  const s1 = createScope({ atoms: [base], parentStore: s0, name: 's1' })
  const mountedMap = getBuildingBlocks(s1)[K.mountedMap]
  const mountedIntermediates = () => intermediates.filter((i) => mountedMap.get(i) !== undefined)

  let unsub = s1.sub(effectAtom, () => {})
  expect(run.mock.calls).toEqual([['small']])

  s1.set(eagerWrite)
  expect(run).toHaveBeenCalledTimes(1)
  expect(mountedIntermediates()).toEqual([intermediates.at(-1)])

  s1.set(base, 20)
  expect(s1.get(derived)).toBe('big')
  expect(run.mock.calls).toEqual([['small'], ['big']])
  expect(cleanup).toHaveBeenCalledOnce()
  expect(mountedIntermediates()).toEqual([intermediates.at(-1)])

  s0.set(base, 100)
  expect(s0.get(derived)).toBe('big')
  s0.set(base, 0)
  expect(s1.get(derived)).toBe('big')
  expect(run).toHaveBeenCalledTimes(2)

  unsub()
  expect(cleanup).toHaveBeenCalledTimes(2)
  expect(mountedIntermediates()).toEqual([])
  expect(mountedMap.get(base)).toBeUndefined()

  unsub = s1.sub(effectAtom, () => {})
  expect(run.mock.calls).toEqual([['small'], ['big'], ['big']])
  s1.set(base, 1)
  expect(run.mock.calls).toEqual([['small'], ['big'], ['big'], ['small']])
  expect(cleanup).toHaveBeenCalledTimes(3)
  expect(mountedIntermediates()).toEqual([intermediates.at(-1)])
  unsub()
  expect(cleanup).toHaveBeenCalledTimes(4)
})
