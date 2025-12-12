import { atom } from 'jotai'
import { describe, expect, test } from 'vitest'
import { createScopes, delay } from '../utils'

describe('async', () => {
  test('should work with async atoms', async () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(0)
    b.debugLabel = 'b'
    const c = atom(async (get) => {
      const aValue = get(a)
      const bValue = get(b)
      await delay(0)
      return '' + aValue + bValue
    })
    c.debugLabel = 'c'
    const s = createScopes([b])
    s[1].sub(c, () => {})
    s[1].set(a, 1)
    expect(await s[0].get(c)).toBe('10')
    expect(await s[1].get(c)).toBe('10')
    s[0].set(b, 1)
    expect(await s[0].get(c)).toBe('11')
    expect(await s[1].get(c)).toBe('10')
  })
})
