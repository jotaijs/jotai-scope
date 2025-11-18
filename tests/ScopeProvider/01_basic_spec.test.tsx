import { render } from '@testing-library/react'
import dedent from 'dedent'
import { atom, createStore, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { atomWithReducer } from 'jotai/vanilla/utils'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { createScope } from '../../src/ScopeProvider/scope'
import {
  clickButton,
  createDebugStore,
  cross,
  getTextContents,
  printAtomState,
  storeGet,
  trackAtomStateMap,
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
          <button
            className={`${level} setBase`}
            type="button"
            onClick={() => increaseBase((c) => c + 1)}>
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
          <button
            className={`${level} setBase`}
            type="button"
            onClick={() => increaseBase((c) => c + 1)}>
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
  test('04. unscoped derived can read and write to scoped primitive atoms', () => {
    const a = atom(0)
    a.debugLabel = 'a'
    const b = atom(
      (get) => get(a),
      (_get, set) => set(a, (v) => v + 1)
    )
    b.debugLabel = 'b'

    function scopes() {
      const s0 = createStore()
      const s1 = createScope({ atoms: [a], parentStore: s0, name: 'S1' })
      return [s0, s1] as const
    }
    function results(s: readonly [Store, Store]) {
      return cross(s, [a, b], storeGet).flat().join('')
    }

    {
      const s = scopes()
      s[0].set(b)
      expect(results(s)).toBe('1100') // Received '1101'
    }
    {
      const s = scopes()
      s[1].set(b)
      expect(results(s)).toBe('0011') // Received '0010'
    }
  })

  /*
    base, notScoped, derived(base + notScoped)
    S0[base]: derived0(base0 + notScoped0)
    S1[base]: derived0(base1 + notScoped0)
  */
  test('05. unscoped derived can read both scoped and unscoped atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1)
    baseAtom.debugLabel = 'base'
    const notScopedAtom = atomWithReducer(0, (v) => v + 1)
    notScopedAtom.debugLabel = 'notScoped'
    const derivedAtom = atom((get) => ({
      base: get(baseAtom),
      notScoped: get(notScopedAtom),
    }))
    derivedAtom.debugLabel = 'derived'

    function Counter({ level }: { level: string }) {
      const increaseBase = useSetAtom(baseAtom)
      const derived = useAtomValue(derivedAtom)
      return (
        <div>
          base:<span className={`${level} base`}>{derived.base}</span>
          not scoped:
          <span className={`${level} notScoped`}>{derived.notScoped}</span>
          <button
            className={`${level} setBase`}
            type="button"
            onClick={increaseBase}>
            increase
          </button>
        </div>
      )
    }

    function IncreaseUnscoped() {
      const increaseNotScoped = useSetAtom(notScopedAtom)
      return (
        <button
          type="button"
          onClick={increaseNotScoped}
          className="increaseNotScoped">
          increase unscoped
        </button>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <IncreaseUnscoped />
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
    const increaseNotScoped = '.increaseNotScoped'
    const atomValueSelectors = [
      '.level0.base',
      '.level1.base',
      '.level1.notScoped',
    ]

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 base
      '0', // level1 base
      '0', // level1 notScoped
    ])

    clickButton(container, increaseUnscopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '0', // level1 base
      '0', // level1 notScoped
    ])

    clickButton(container, increaseScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
      '0', // level1 notScoped
    ])

    clickButton(container, increaseNotScoped)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
      '1', // level1 notScoped
    ])
  })

  /*
    S0[ ]: a0, b0(a0)
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

    function getScopes() {
      const s0 = createStore()
      const s1 = createScope({ atoms: [b], parentStore: s0, name: 'S1' })
      return [s0, s1] as const
    }

    {
      const s = getScopes()
      s[0].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('10') // Received '11' <===========
    }
    {
      const s = getScopes()
      s[1].set(a, (v) => v + 1)
      expect(s.map((s) => s.get(b)).join('')).toBe('10') // Received '11'
    }
    {
      const s = getScopes()
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
      const s0 = createStore()
      const s1 = createScope({ atoms: [b, c], parentStore: s0, name: 'S1' })
      s0.sub(b, () => {})
      return [s0, s1] as const
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
          <button
            className={`${level} setBase`}
            type="button"
            onClick={() => increaseBase()}>
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

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
    ])

    clickButton(container, increaseUnscopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
    ])

    clickButton(container, increaseScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '0',
    ])

    clickButton(container, increaseDoubleScopedBase)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
    ])
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
      const s0 = createDebugStore()
      const s1 = createScope({
        atoms: [b],
        parentStore: s0,
        name: 'S1',
      })
      const s = [s0, s1] as const
      cross(s, [b, c, d], (sx, ax) => sx.sub(ax as any, () => {}))
      return s
    }

    const s = getScopes()
    trackAtomStateMap(s[0])
    /*
      S0[]: b0, c0, d0(b0 + c0)
      S1[b]: b1, c0, d0(b1 + c0)
    */
    expect(printAtomState(s[0])).toBe(dedent`
      b: v=0
      c: v=0
      d: v=00
        b: v=0
        c: v=0
      b@S1: v=0
      d?@S1: v=00
        d@S1: v=00
          b@S1: v=0
          c: v=0
      d@S1: v=00
        b@S1: v=0
        c: v=0
      --------------------
    `)
    console.log('set d in S0')
    s[0].set(d)
    /*
      1. set d
      2. set b to 1
      3. set c to 1
      4. changedAtoms: [b, c, d]
      5. invalidatedAtoms: [d, d@S1, d?@S1]
      6. changedAtoms: [b, c, d]
    */
    expect(printAtomState(s[0])).toBe(dedent`
      b: v=1
      c: v=1
      d: v=11
        b: v=1
        c: v=1
      b@S1: v=0
      d?@S1: v=01
        d@S1: v=01
          b@S1: v=0
          c: v=1
      d@S1: v=01
        b@S1: v=0
        c: v=1
      --------------------
    `)
  })

  /*
    baseA, baseB, baseC, derived(baseA + baseB + baseC)
    S0[     ]: derived(baseA0 + baseB0 + baseC0)
    S1[baseB]: derived(baseA0 + baseB1 + baseC0)
    S2[baseC]: derived(baseA0 + baseB1 + baseC2)
  */
  test('10. unscoped derived atoms in nested scoped can read and write to scoped primitive atoms at every level (vanilla)', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    const b = atomWithReducer(0, (v) => v + 1)
    const c = atomWithReducer(0, (v) => v + 1)
    const d = atom(
      (get) => [get(a), get(b), get(c)],
      (_, set) => [set(a), set(b), set(c)]
    )
    function when(fn?: (s: readonly [Store, Store, Store]) => void) {
      const s0 = createStore()
      const s1 = createScope({
        atoms: [b],
        parentStore: s0,
        name: 'S1',
      })
      const s2 = createScope({
        atoms: [c],
        parentStore: s1,
        name: 'S2',
      })
      const s = [s0, s1, s2] as const
      s0.sub(a, () => {})
      s0.sub(d, () => {})
      s1.sub(b, () => {})
      s1.sub(d, () => {})
      s2.sub(c, () => {})
      s2.sub(d, () => {})
      fn?.(s)
      return s
        .map((sx) => [sx.get(a), sx.get(b), sx.get(c), ...sx.get(d)].join(''))
        .join('|')
    }
    expect(when((s) => s[0].set(a))).toBe('100100|100100|100100')
    expect(when((s) => s[1].set(b))).toBe('000000|010010|010010')
    expect(when((s) => s[2].set(c))).toBe('000000|000000|001001')
    expect(when((s) => s[0].set(d))).toBe('111111|101101|100100')
    expect(when((s) => s[1].set(d))).toBe('101101|111111|110110')
    expect(when((s) => s[2].set(d))).toBe('100100|110110|111111')
  })

  /*
    baseA, baseB, derived(baseA + baseB)
    S1[baseB, derived]: derived1(baseA1 + baseB1)
    S2[baseB]: derived1(baseA1 + baseB2)
  */
  test('11. inherited scoped derived atoms can read and write to scoped primitive atoms at every nested level', () => {
    const baseAAtom = atomWithReducer(0, (v) => v + 1)
    baseAAtom.debugLabel = 'baseA'

    const baseBAtom = atomWithReducer(0, (v) => v + 1)
    baseBAtom.debugLabel = 'baseB'

    const derivedAtom = atom(
      (get) => ({
        baseA: get(baseAAtom),
        baseB: get(baseBAtom),
      }),
      (_get, set) => {
        set(baseAAtom)
        set(baseBAtom)
      }
    )
    derivedAtom.debugLabel = 'derived'

    function Counter({ level }: { level: string }) {
      const [{ baseA, baseB }, increaseAll] = useAtom(derivedAtom)
      return (
        <div>
          baseA:<span className={`${level} baseA`}>{baseA}</span>
          baseB:<span className={`${level} baseB`}>{baseB}</span>
          <button
            className={`${level} increaseAll`}
            type="button"
            onClick={increaseAll}>
            increase all
          </button>
        </div>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseBAtom, derivedAtom]} name="level1">
            <Counter level="level1" />
            <ScopeProvider atoms={[baseBAtom]} name="level2">
              <Counter level="level2" />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      )
    }
    const { container } = render(<App />)

    const increaseLevel1All = '.level1.increaseAll'
    const increaseLevel2All = '.level2.increaseAll'
    const atomValueSelectors = [
      '.level1.baseA',
      '.level1.baseB',
      '.level2.baseA',
      '.level2.baseB',
    ]

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level1 baseA1
      '0', // level1 baseB1
      '0', // level2 baseA1
      '0', // level2 baseB2
    ])

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    clickButton(container, increaseLevel1All)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level1 baseA1
      '1', // level1 baseB1
      '1', // level2 baseA1
      '0', // level2 baseB2
    ])

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    clickButton(container, increaseLevel2All)
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level1 baseA1
      '1', // level1 baseB1
      '2', // level2 baseA1
      '1', // level2 baseB2
    ])
  })
})
