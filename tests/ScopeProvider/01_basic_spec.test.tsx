import { render } from '@testing-library/react'
import dedent from 'dedent'
import { atom, createStore, useAtom } from 'jotai'
import { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { atomWithReducer } from 'jotai/vanilla/utils'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { createScope } from '../../src/ScopeProvider/scope'
import {
  clickButton,
  createScopes,
  getTextContents,
  initializeAll,
  printAtomState,
  printMountedMap,
  subscribeAll,
} from '../utils'

describe('Counter', () => {
  /*
    base
    S0[]: base0
    S1[]: base0
  */
  test('01. ScopeProvider does not provide isolation for unscoped primitive atoms', () => {
    const baseAtom = atom(0)
    baseAtom.debugLabel = 'base'
    function Counter({ level }: { level: string }) {
      const [base, increaseBase] = useAtom(baseAtom)
      return (
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button className={`${level} setBase`} type="button" onClick={() => increaseBase((c) => c + 1)}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[]} name="level1">
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      )
    }
    const { container } = render(<App />)
    const increaseUnscopedBase = '.level0.setBase'
    const increaseScopedBase = '.level1.setBase'
    const atomValueSelectors = ['.level0.base', '.level1.base']

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 base
      '0', // level1 base
    ])

    clickButton(container, increaseUnscopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
    ])

    clickButton(container, increaseScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 base
      '2', // level1 base
    ])
  })

  /*
    S0[]: a0 b0(a0)
    S1[]: a0 b0(a0)
  */
  test('02. unscoped derived atoms are unaffected in ScopeProvider', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    b.debugLabel = 'b'

    function createScopes() {
      const s0 = createStore()
      const s1 = createScope({ atoms: [], parentStore: s0, name: 'S1' })
      return [s0, s1] as const
    }

    {
      const s = createScopes()
      s[0].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('11')
    }

    {
      const s = createScopes()
      s[1].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('11')
    }
  })

  /*
    base
    S0[base]: base0
    S1[base]: base1
  */
  test('03. ScopeProvider provides isolation for scoped primitive atoms', () => {
    const baseAtom = atom(0)
    baseAtom.debugLabel = 'base'
    function Counter({ level }: { level: string }) {
      const [base, increaseBase] = useAtom(baseAtom)
      return (
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button className={`${level} setBase`} type="button" onClick={() => increaseBase((c) => c + 1)}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]} name="level1">
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      )
    }
    const { container } = render(<App />)
    const increaseUnscopedBase = '.level0.setBase'
    const increaseScopedBase = '.level1.setBase'
    const atomValueSelectors = ['.level0.base', '.level1.base']

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 base
      '0', // level1 base
    ])

    clickButton(container, increaseUnscopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '0', // level1 base
    ])

    clickButton(container, increaseScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
    ])
  })

  /*
    S0[a]: b0(a0)
    S1[a]: b0(a1)
  */
  describe('0.4 unscoped derived can read and write to scoped primitive atoms', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    b.debugLabel = 'b'

    function results(s: readonly [Store, Store]) {
      return initializeAll(s, [a, b]).flat().join('')
    }
    test('04.1 Writing through S0 should write to a (not a1)', () => {
      const s = createScopes([a])
      subscribeAll(s, [a, b])
      s[0].set(b)
      // After s[0].set(b): b.write calls set(a, ...) which writes to a (S0's atom)
      expect(printAtomState(s[0])).toBe(dedent`
        a: v=1
        b: v=1
          a: v=1
        a1: v=0
        b1: v=0
          a1: v=0
      `)
      expect(printMountedMap(s[0])).toBe(dedent`
        a: l=a$S0 d=[] t=b
        b: l=b$S0 d=a t=[]
        a1: l=a$S1 d=[] t=b1
        b1: l=b$S1 d=a1 t=[]
      `)

      // After results(s): both stores are initialized
      expect(results(s)).toBe('1100')
      expect(printAtomState(s[0])).toBe(dedent`
        a: v=1
        b: v=1
          a: v=1
        a1: v=0
        b1: v=0
          a1: v=0
      `)
    })

    test('04.2 Writing through S1 should write to a1 (not a)', () => {
      const s = createScopes([a])
      subscribeAll(s, [a, b])
      expect(printAtomState(s[0])).toBe(dedent`
        a: v=0
        b: v=0
          a: v=0
        a1: v=0
        b1: v=0
          a1: v=0
      `)
      expect(printMountedMap(s[0])).toBe(dedent`
        a: l=a$S0 d=[] t=b
        b: l=b$S0 d=a t=[]
        a1: l=a$S1 d=[] t=b1
        b1: l=b$S1 d=a1 t=[]
      `)

      s[1].set(b)
      // EXPECTED: b.write calls set(a, ...) which should write to a1 (S1's scoped atom)
      // because we're calling through S1, so set should be scope-aware
      expect(s[0].get(a)).toBe(0) // a should NOT be modified
      expect(s[1].get(a)).toBe(1) // a1 SHOULD be incremented
      expect(printAtomState(s[0])).toBe(dedent`
        a: v=0
        b: v=0
          a: v=0
        a1: v=1
        b1: v=1
          a1: v=1
      `)
      expect(printMountedMap(s[0])).toBe(dedent`
        a: l=a$S0 d=[] t=b
        b: l=b$S0 d=a t=[]
        a1: l=a$S1 d=[] t=b1
        b1: l=b$S1 d=a1 t=[]
      `)

      expect(results(s)).toBe('0011')
      expect(printAtomState(s[0])).toBe(dedent`
        a: v=0
        b: v=0
          a: v=0
        a1: v=1
        b1: v=1
          a1: v=1
      `)
      expect(printMountedMap(s[0])).toBe(dedent`
        a: l=a$S0 d=[] t=b
        b: l=b$S0 d=a t=[]
        a1: l=a$S1 d=[] t=b1
        b1: l=b$S1 d=a1 t=[]
      `)
    })

    test('04.3 Writing through S1 (unsubscribed) should write to a1 (not a)', () => {
      /**```
        S0[a]: b0(a0)
        S1[a]: b1(a1)
      */
      const s = createScopes([a])

      s[1].set(b)
      // EXPECTED: b.write calls set(a, ...) which should write to a1 (S1's scoped atom)
      // because we're calling through S1, so set should be scope-aware
      expect(s[0].get(a)).toBe(0) // a should NOT be modified
      expect(s[1].get(a)).toBe(1) // a1 SHOULD be incremented
      // TODO: we should not read b when writing to b
      expect(printAtomState(s[0])).toBe(dedent`
        b: v=0
          a: v=0
        a: v=0
        b1: v=undefined
        a1: v=1
      `)

      expect(results(s)).toBe('0011')
      expect(printAtomState(s[0])).toBe(dedent`
        b: v=0
          a: v=0
        a: v=0
        b1: v=1
          a1: v=1
        a1: v=1
      `)
    })
  })

  /**
    S0[_]: a0, b0, c(a0 + b0)
    S1[a]: a1, b0, c(a1 + b0)
  */
  test('05. unscoped derived can read both scoped and unscoped atoms', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'a'
    const b = atomWithReducer(0, (v) => v + 1)
    b.debugLabel = 'b'
    const c = atom((get) => [get(a), get(b)])
    c.debugLabel = 'c'

    /**```
      S0[_]: a0, b0, c(a0 + b0)
      S1[a]: a1, b0, c(a1 + b0)
    */
    const s = createScopes([a])
    subscribeAll(s, [a, b, c])

    expect(printAtomState(s[0])).toBe(dedent`
      a: v=0
      b: v=0
      c: v=0,0
        a: v=0
        b: v=0
      a1: v=0
      c1: v=0,0
        a1: v=0
        b: v=0
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=a$S0 d=[] t=c
      b: l=b$S0,b$S1 d=[] t=c,c1
      c: l=c$S0 d=a,b t=[]
      a1: l=a$S1 d=[] t=c1
      c1: l=c$S1 d=a1,b t=[]
    `)

    s[0].set(a)
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=1
      b: v=0
      c: v=1,0
        a: v=1
        b: v=0
      a1: v=0
      c1: v=0,0
        a1: v=0
        b: v=0
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=a$S0 d=[] t=c
      b: l=b$S0,b$S1 d=[] t=c,c1
      c: l=c$S0 d=a,b t=[]
      a1: l=a$S1 d=[] t=c1
      c1: l=c$S1 d=a1,b t=[]
    `)

    s[1].set(a)
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=1
      b: v=0
      c: v=1,0
        a: v=1
        b: v=0
      a1: v=1
      c1: v=1,0
        a1: v=1
        b: v=0
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=a$S0 d=[] t=c
      b: l=b$S0,b$S1 d=[] t=c,c1
      c: l=c$S0 d=a,b t=[]
      a1: l=a$S1 d=[] t=c1
      c1: l=c$S1 d=a1,b t=[]
    `)

    s[0].set(b)
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=1
      b: v=1
      c: v=1,1
        a: v=1
        b: v=1
      a1: v=1
      c1: v=1,1
        a1: v=1
        b: v=1
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=a$S0 d=[] t=c
      b: l=b$S0,b$S1 d=[] t=c,c1
      c: l=c$S0 d=a,b t=[]
      a1: l=a$S1 d=[] t=c1
      c1: l=c$S1 d=a1,b t=[]
    `)
  })

  /*
    S0[_]: a0, b0(a0)
    S1[b]: a0, b1(a1)
  */
  test('06. dependencies of scoped derived are implicitly scoped', () => {
    const a = atom(0)
    a.debugLabel = 'a'

    const b = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    b.debugLabel = 'b'

    {
      const s = createScopes([b])
      s[0].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('10') // Received '11' <===========
    }
    {
      const s = createScopes([b])
      s[1].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('10') // Received '11'
    }
    {
      const s = createScopes([b])
      s[1].set(b)
      expect(s.map((s) => s.get(b)).join('')).toBe('01') // Received '00'
    }
  })

  /*
    S0[b,c]: a0, b0(a0), c0(a0)
    S1[b,c]: a0, b1(a1), c1(a1)
  */
  test('07. scoped derived atoms can share implicitly scoped dependencies', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    b.debugLabel = 'b'
    const c = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    c.debugLabel = 'c'

    function getScopes() {
      const s = createScopes([b, c])
      s[0].sub(b, () => {})
      return s
    }
    {
      const s = getScopes()
      s[0].set(a, (v) => v + 1)
      expect([s[0].get(b), s[1].get(b), s[1].get(c)].join('')).toBe('100')
    }
    {
      const s = getScopes()
      s[1].set(a, (v) => v + 1)
      expect([s[0].get(b), s[1].get(b), s[1].get(c)].join('')).toBe('100')
    }
    {
      const s = getScopes()
      s[1].set(b)
      expect([s[0].get(b), s[1].get(b), s[1].get(c)].join('')).toBe('011')
    }
    {
      const s = getScopes()
      s[1].set(c)
      expect([s[0].get(b), s[1].get(b), s[1].get(c)].join('')).toBe('011')
    }
  })

  /*
    base, derivedA(base), derivedB(base)
    S0[base]: base0
    S1[base]: base1
    S2[base]: base2
    S3[base]: base3
  */
  test('08. nested scopes provide isolation for primitive atoms at every level', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1)

    function Counter({ level }: { level: string }) {
      const [base, increaseBase] = useAtom(baseAtom)
      return (
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button className={`${level} setBase`} type="button" onClick={() => increaseBase()}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter level="level1" />
            <ScopeProvider atoms={[baseAtom]}>
              <Counter level="level2" />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      )
    }
    const { container } = render(<App />)
    const increaseUnscopedBase = '.level0.setBase'
    const increaseScopedBase = '.level1.setBase'
    const increaseDoubleScopedBase = '.level2.setBase'
    const atomValueSelectors = ['.level0.base', '.level1.base', '.level2.base']

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0', '0'])

    clickButton(container, increaseUnscopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0', '0'])

    clickButton(container, increaseScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1', '0'])

    clickButton(container, increaseDoubleScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1', '1'])
  })

  /*
    S0[]: b0, c0, d0(b0 + c0)
    S1[b]: b1, c0, d0(b1 + c0)
  */
  test('09. implicitly scoped atoms are scoped', () => {
    const b = atom(0)
    b.debugLabel = 'b'
    const c = atom(0)
    c.debugLabel = 'c'
    const d = atom(
      (get) => '' + get(b) + get(c),
      (_, set) => [set(b, (v) => v + 1), set(c, (v) => v + 1)]
    )
    d.debugLabel = 'd'

    function getScopes() {
      const s = createScopes([b])
      subscribeAll(s, [b, c, d])
      return s
    }

    const s = getScopes()
    /*
      S0[]: b0, c0, d0(b0 + c0)
      S1[b]: b1, c0, d1(b1 + c0)
    */
    expect(printAtomState(s[0])).toBe(dedent`
      b: v=0
      c: v=0
      d: v=00
        b: v=0
        c: v=0
      b1: v=0
      d1: v=00
        b1: v=0
        c: v=0
    `)
    s[0].set(d)
    expect(printAtomState(s[0])).toBe(dedent`
      b: v=1
      c: v=1
      d: v=11
        b: v=1
        c: v=1
      b1: v=0
      d1: v=01
        b1: v=0
        c: v=1
    `)
  })

  /**
    S0[_]: d0(a0 + b0 + c0)
    S1[b]: d1(a0 + b1 + c0)
    S2[c]: d2(a0 + b1 + c2)
  */
  test('10. unscoped derived atoms in nested scoped can read and write to scoped primitive atoms at every level (vanilla)', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'a'
    const b = atomWithReducer(0, (v) => v + 1)
    b.debugLabel = 'b'
    const c = atomWithReducer(0, (v) => v + 1)
    c.debugLabel = 'c'
    const d = atom(
      (get) => [get(a), get(b), get(c)],
      (_, set) => [set(a), set(b), set(c)]
    )
    d.debugLabel = 'd'
    function when(fn?: (s: readonly [Store, Store, Store]) => void) {
      /**```
        S0[_]: d0(a0 + b0 + c0)
        S1[b]: d1(a0 + b1 + c0)
        S2[c]: d2(a0 + b1 + c2)
      */
      const s = createScopes([b], [c])
      subscribeAll(s, [a, b, c, d])
      fn?.(s)
      return s.map((sx) => [sx.get(a), sx.get(b), sx.get(c), ...sx.get(d)].join('')).join('|')
    }
    const s = createScopes([b], [c])
    subscribeAll(s, [a, b, c, d])
    s[0].set(a)
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=1
      b: v=0
      c: v=0
      d: v=1,0,0
        a: v=1
        b: v=0
        c: v=0
      b1: v=0
      d1: v=1,0,0
        a: v=1
        b1: v=0
        c: v=0
      c2: v=0
      d2: v=1,0,0
        a: v=1
        b1: v=0
        c2: v=0
    `)
    expect(when((s) => s[0].set(a))).toBe('100100|100100|100100')
    expect(when((s) => s[1].set(b))).toBe('000000|010010|010010')
    expect(when((s) => s[2].set(c))).toBe('000000|000000|001001')
    expect(when((s) => s[0].set(d))).toBe('111111|101101|100100')
    expect(when((s) => s[1].set(d))).toBe('101101|111111|110110')
    expect(when((s) => s[2].set(d))).toBe('100100|110110|111111')
  })

  /**
    S0[___]: a0, b0, c0(a0 + b0)
    S1[b,c]: a0, b1, c1(a1 + b1)
    S2[b  ]: a0, b2, c2(a1 + b2)
  */
  test('11. inherited scoped derived atoms can read and write to scoped primitive atoms at every nested level', () => {
    const a = atom(0)
    a.debugLabel = 'a'

    const b = atom(0)
    b.debugLabel = 'b'

    const c = atom(
      (get) => [get(a), get(b)],
      (_get, set, v: number) => {
        set(a, v)
        set(b, v)
      }
    )
    c.debugLabel = 'c'

    /**```
      S0[___]: a0, b0, c0(a0 + b0)
      S1[b,c]: a0, b1, c1(a1 + b1)
      S2[b  ]: a0, b2, c2(a1 + b2)
    */
    const s = createScopes([b, c], [b])
    subscribeAll(s, [c])

    function getResults() {
      return [s[1].get(c), s[2].get(c)].flat().join('')
    }

    expect(printAtomState(s[0])).toBe(dedent`
      c: v=0,0
        a: v=0
        b: v=0
      a: v=0
      b: v=0
      c1: v=0,0
        a1: v=0
        b1: v=0
      a1: v=0
      b1: v=0
      c2: v=0,0
        a1: v=0
        b2: v=0
      b2: v=0
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=[] d=[] t=c
      b: l=[] d=[] t=c
      c: l=c$S0 d=a,b t=[]
      a1: l=[] d=[] t=c1,c2
      b1: l=[] d=[] t=c1
      c1: l=c$S1 d=a1,b1 t=[]
      b2: l=[] d=[] t=c2
      c2: l=c$S2 d=a1,b2 t=[]
    `)
    expect(getResults()).toBe('0000')

    s[1].set(c, 1)
    expect(printAtomState(s[0])).toBe(dedent`
      c: v=0,0
        a: v=0
        b: v=0
      a: v=0
      b: v=0
      c1: v=1,1
        a1: v=1
        b1: v=1
      a1: v=1
      b1: v=1
      c2: v=1,0
        a1: v=1
        b2: v=0
      b2: v=0
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=[] d=[] t=c
      b: l=[] d=[] t=c
      c: l=c$S0 d=a,b t=[]
      a1: l=[] d=[] t=c1,c2
      b1: l=[] d=[] t=c1
      c1: l=c$S1 d=a1,b1 t=[]
      b2: l=[] d=[] t=c2
      c2: l=c$S2 d=a1,b2 t=[]
    `)
    expect(getResults()).toBe('1110')

    s[2].set(c, 2)
    expect(printAtomState(s[0])).toBe(dedent`
      c: v=0,0
        a: v=0
        b: v=0
      a: v=0
      b: v=0
      c1: v=2,1
        a1: v=2
        b1: v=1
      a1: v=2
      b1: v=1
      c2: v=2,2
        a1: v=2
        b2: v=2
      b2: v=2
    `)
    expect(printMountedMap(s[0])).toBe(dedent`
      a: l=[] d=[] t=c
      b: l=[] d=[] t=c
      c: l=c$S0 d=a,b t=[]
      a1: l=[] d=[] t=c1,c2
      b1: l=[] d=[] t=c1
      c1: l=c$S1 d=a1,b1 t=[]
      b2: l=[] d=[] t=c2
      c2: l=c$S2 d=a1,b2 t=[]
    `)
    expect(getResults()).toBe('2122')
  })
})

describe('topology 1', () => {
  const a = atom('-')
  a.debugLabel = 'a'
  const b = atom('-')
  b.debugLabel = 'b'
  const c = atom(
    (get) => get(a) + get(b),
    (_get, set, [va, vb]: [string?, string?]) => [va && set(a, va), vb && set(b, vb)]
  )
  c.debugLabel = 'c'
  const d = atom(
    (get) => get(a) + get(b),
    (_get, set, [va, vb]: [string?, string?]) => [va && set(a, va), vb && set(b, vb)]
  )
  d.debugLabel = 'd'
  const e = atom(
    (get) => get(c),
    (_get, set, [va, vb]: [string?, string?]) => set(c, [va, vb])
  )
  e.debugLabel = 'e'

  test(`
    S0[_]: a0, b0, c0(a0 + b0)
    S1[a]: a1, b0, c1(a1 + b0)
    S2[_]: a1, b0, c1(a1 + b0)
  `, () => {
    const s = createScopes([a], [])
    subscribeAll(s, [a, b, c])
    expect(printAtomState(s[0])).toBe(dedent`
      a: v=-
      b: v=-
      c: v=--
        a: v=-
        b: v=-
      a1: v=-
      c1: v=--
        a1: v=-
        b: v=-
    `)
  })
})
