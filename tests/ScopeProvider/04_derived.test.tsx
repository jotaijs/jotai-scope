import { render } from '@testing-library/react'
import { atom, useAtom } from 'jotai'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { clickButton, getTextContents } from '../utils'

const atomValueSelectors = [
  '.case1.base',
  '.case1.derivedA',
  '.case1.derivedB',
  '.case2.base',
  '.case2.derivedA',
  '.case2.derivedB',
  '.layer1.base',
  '.layer1.derivedA',
  '.layer1.derivedB',
  '.layer2.base',
  '.layer2.derivedA',
  '.layer2.derivedB',
]

function clickButtonGetResults(buttonSelector: string) {
  const baseAtom = atom(0)
  const derivedAtomA = atom(
    (get) => get(baseAtom),
    (get, set) => {
      set(baseAtom, get(baseAtom) + 1)
    }
  )

  const derivedAtomB = atom(
    (get) => get(baseAtom),
    (get, set) => {
      set(baseAtom, get(baseAtom) + 1)
    }
  )

  function Counter({ counterClass }: { counterClass: string }) {
    const [base, setBase] = useAtom(baseAtom)
    const [derivedA, setDerivedA] = useAtom(derivedAtomA)
    const [derivedB, setDerivedB] = useAtom(derivedAtomB)
    return (
      <>
        <div>
          base:<span className={`${counterClass} base`}>{base}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => setBase((c) => c + 1)}>
            increment
          </button>
        </div>
        <div>
          derivedA:
          <span className={`${counterClass} derivedA`}>{derivedA}</span>
          <button
            className={`${counterClass} setDerivedA`}
            type="button"
            onClick={() => setDerivedA()}>
            increment
          </button>
        </div>
        <div>
          derivedB:
          <span className={`${counterClass} derivedB`}>{derivedB}</span>
          <button
            className={`${counterClass} setDerivedB`}
            type="button"
            onClick={() => setDerivedB()}>
            increment
          </button>
        </div>
      </>
    )
  }

  function App() {
    return (
      <div>
        <h1>Only base is scoped</h1>
        <p>derivedA and derivedB should also be scoped</p>
        <ScopeProvider atoms={[baseAtom]} debugName="case1">
          <Counter counterClass="case1" />
        </ScopeProvider>
        <h1>Both derivedA an derivedB are scoped</h1>
        <p>base should be global, derivedA and derivedB are shared</p>
        <ScopeProvider atoms={[derivedAtomA, derivedAtomB]} debugName="case2">
          <Counter counterClass="case2" />
        </ScopeProvider>
        <h1>Layer1: Only derivedA is scoped</h1>
        <p>base and derivedB should be global</p>
        <ScopeProvider atoms={[derivedAtomA]} debugName="layer1">
          <Counter counterClass="layer1" />
          <h2>Layer2: Base and derivedB are scoped</h2>
          <p>
            derivedA should use layer2&apos;s atom, base and derivedB are layer
            2 scoped
          </p>
          <ScopeProvider atoms={[baseAtom, derivedAtomB]} debugName="layer2">
            <Counter counterClass="layer2" />
          </ScopeProvider>
        </ScopeProvider>
      </div>
    )
  }

  const { container } = render(<App />)
  expectAllZeroes(container)
  clickButton(container, buttonSelector)
  return getTextContents(container, atomValueSelectors)
}

function expectAllZeroes(container: HTMLElement) {
  expect(getTextContents(container, atomValueSelectors)).toEqual([
    // case 1
    '0', // base
    '0', // derivedA
    '0', // derivedB

    // case 2
    '0', // base
    '0', // derivedA
    '0', // derivedB

    // layer 1
    '0', // base
    '0', // derivedA
    '0', // derivedB

    // layer 2
    '0', // base
    '0', // derivedA
    '0', // derivedB
  ])
}

describe('Counter', () => {
  test("parent scope's derived atom is prior to nested scope's scoped base", () => {
    const increaseCase1Base = '.case1.setBase'
    const increaseCase1DerivedA = '.case1.setDerivedA'
    const increaseCase1DerivedB = '.case1.setDerivedB'
    const increaseCase2Base = '.case2.setBase'
    const increaseCase2DerivedA = '.case2.setDerivedA'
    const increaseCase2DerivedB = '.case2.setDerivedB'
    const increaseLayer1Base = '.layer1.setBase'
    const increaseLayer1DerivedA = '.layer1.setDerivedA'
    const increaseLayer1DerivedB = '.layer1.setDerivedB'
    const increaseLayer2Base = '.layer2.setBase'
    const increaseLayer2DerivedA = '.layer2.setDerivedA'
    const increaseLayer2DerivedB = '.layer2.setDerivedB'

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase1Base)).toEqual([
      // case 1
      '1', // base
      '1', // derivedA
      '1', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase1DerivedA)).toEqual([
      // case 1
      '1', // base
      '1', // derivedA
      '1', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase1DerivedB)).toEqual([
      // case 1
      '1', // base
      '1', // derivedA
      '1', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase2Base)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '1', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '1', // base
      '0', // derivedA
      '1', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase2DerivedA)).toEqual([
      // case 1: case 1
      '0', // base            actual:  0,
      '0', // derivedA        actual:  0,
      '0', // derivedB        actual:  0,

      // case 2
      '0', // base            actual:  1,
      '1', // derivedA        actual:  1,
      '1', // derivedB        actual:  1,

      // layer 1
      '0', // base            actual:  1,
      '0', // derivedA        actual:  0,
      '0', // derivedB        actual:  1,

      // layer 2
      '0', // base            actual:  0,
      '0', // derivedA        actual:  0,
      '0', // derivedB        actual:  0
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseCase2DerivedB)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '0', // base
      '1', // derivedA
      '1', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer1Base)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '1', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '1', // base
      '0', // derivedA
      '1', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer1DerivedA)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '1', // derivedA
      '0', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer1DerivedB)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '1', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '1', // base
      '0', // derivedA
      '1', // derivedB

      // layer 2
      '0', // base
      '0', // derivedA
      '0', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer2Base)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '1', // base
      '1', // derivedA
      '1', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer2DerivedA)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '1', // base
      '1', // derivedA
      '1', // derivedB
    ])

    /*
      base, derivedA(base), derivedB(base)
      case1[base]: base1, derivedA0(base1), derivedB0(base1)
      case2[derivedA, derivedB]: base0, derivedA1(base1), derivedB1(base1)
      layer1[derivedA]: base0, derivedA1(base1), derivedB0(base0)
      layer2[base, derivedB]: base2, derivedA1(base2), derivedB2(base2)
    */
    expect(clickButtonGetResults(increaseLayer2DerivedB)).toEqual([
      // case 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // case 2
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 1
      '0', // base
      '0', // derivedA
      '0', // derivedB

      // layer 2
      '1', // base
      '1', // derivedA
      '1', // derivedB
    ])
  })
})
