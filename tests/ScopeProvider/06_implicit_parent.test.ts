import dedent from 'dedent'
import { atom } from 'jotai'
import { describe, expect, it } from 'vitest'
import { createScopes, printSortedAtomState, subscribeAll } from '../utils'

describe('Implicit parent does not affect unscoped (vanilla)', () => {
  const a = atom(0)
  a.debugLabel = 'a'
  const b = atom((get) => get(a))
  b.debugLabel = 'b'

  const cases = [
    ['ab', 'ab'],
    ['ab', 'ba'],
    ['ba', 'ab'],
    ['ba', 'ba'],
  ] as const

  it.each(cases)('level 1: %s and level 2: %s', (level1, level2) => {
    const level1Atoms = level1 === 'ab' ? [a, b] : [b, a]
    const level2Atoms = level2 === 'ab' ? [a, b] : [b, a]

    /**```
      S0[_]: a0, b0(a0)
      S1[b]: a0, b1(a1)
      S2[_]: a0, b1(a1)
    */
    const s = createScopes([b], [])
    const [s0, s1, s2] = s

    subscribeAll([s1], level1Atoms)
    expect(printSortedAtomState(s0)).toBe(dedent`
      a: v=0
      a1: v=0
      b1: v=0
        a1: v=0
    `)
    subscribeAll([s2], level2Atoms)
    expect(printSortedAtomState(s0)).toBe(dedent`
      a: v=0
      a1: v=0
      b1: v=0
        a1: v=0
    `)

    s2.set(a, 1)

    expect(printSortedAtomState(s0)).toBe(dedent`
      a: v=1
      a1: v=0
      b1: v=0
        a1: v=0
    `)

    expect(s1.get(a)).toBe(1)
    expect(s1.get(b)).toBe(0)
    expect(s2.get(a)).toBe(1)
    expect(s2.get(b)).toBe(0)
  })
})
