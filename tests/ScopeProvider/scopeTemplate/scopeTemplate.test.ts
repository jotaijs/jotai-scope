import { describe, expect, test } from 'vitest'
import { scopeTemplate } from './scopeTemplate'

describe('scopeTemplate', () => {
  test('basic', function test() {
    const {
      atoms: { a: _a, b, c: _c },
      scopes: { S0, S1 },
      getAtoms,
      resetAll,
    } = scopeTemplate(`
      a, b(a), c(a + b(a))
      S0[ ]: a0, b0(a0), c0(a0, b0(a0))
      S1[b]: a0, b1(a1), c0(a0, b1(a1))
    `)
    expect(getAtoms(S0)).toEqual(['a', 'a', 'aa'])
    expect(getAtoms(S1)).toEqual(['a', 'a', 'aa'])
    S0.set(b, '*')
    expect(getAtoms(S0)).toEqual(['*', '*', '**'])
    expect(getAtoms(S1)).toEqual(['*', 'a', '*a'])

    resetAll()
    expect(getAtoms(S0)).toEqual(['a', 'a', 'aa'])
    expect(getAtoms(S1)).toEqual(['a', 'a', 'aa'])
    S1.set(b, '*')
    expect(getAtoms(S0)).toEqual(['a', 'a', 'aa'])
    expect(getAtoms(S1)).toEqual(['a', '*', 'a*'])
  })
})
