import type { FC } from 'react'
import { render } from '@testing-library/react'
import { atom, useAtom, useAtomValue } from 'jotai'
import { atomWithReducer } from 'jotai/vanilla/utils'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { clickButton, getTextContents } from '../utils'

function renderWithOrder(level1: 'BD' | 'DB', level2: 'BD' | 'DB') {
  const baseAtom = atomWithReducer(0, (v) => v + 1)
  baseAtom.debugLabel = 'baseAtom'
  baseAtom.toString = function toString() {
    return this.debugLabel ?? 'Unknown Atom'
  }

  const derivedAtom = atom((get) => get(baseAtom))
  derivedAtom.debugLabel = 'derivedAtom'
  derivedAtom.toString = function toString() {
    return this.debugLabel ?? 'Unknown Atom'
  }

  function BaseThenDerived({ level }: { level: string }) {
    const [base, increaseBase] = useAtom(baseAtom)
    const derived = useAtomValue(derivedAtom)
    return (
      <>
        <div>
          base: <span className={`${level} base`}>{base}</span>
          <button
            type="button"
            className={`${level} setBase`}
            onClick={increaseBase}>
            +
          </button>
        </div>
        <div>
          derived:<span className={`${level} derived`}>{derived}</span>
        </div>
      </>
    )
  }

  function DerivedThenBase({ level }: { level: string }) {
    const derived = useAtomValue(derivedAtom)
    const [base, increaseBase] = useAtom(baseAtom)
    return (
      <>
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button
            type="button"
            className={`${level} setBase`}
            onClick={increaseBase}>
            +
          </button>
        </div>
        <div>
          derived:<span className={`${level} derived`}>{derived}</span>
        </div>
      </>
    )
  }
  function App(props: {
    Level1Counter: FC<{ level: string }>
    Level2Counter: FC<{ level: string }>
  }) {
    const { Level1Counter, Level2Counter } = props
    return (
      <div>
        <h1>Layer 1: Scope derived</h1>
        <p>base should be globally shared</p>
        <ScopeProvider atoms={[derivedAtom]} debugName="layer1">
          <Level1Counter level="layer1" />
          <h1>Layer 2: Scope base</h1>
          <p>base should be globally shared</p>
          <ScopeProvider atoms={[]} debugName="layer2">
            <Level2Counter level="layer2" />
          </ScopeProvider>
        </ScopeProvider>
      </div>
    )
  }
  function getCounter(order: 'BD' | 'DB') {
    return order === 'BD' ? BaseThenDerived : DerivedThenBase
  }
  return render(
    <App
      Level1Counter={getCounter(level1)}
      Level2Counter={getCounter(level2)}
    />
  )
}

/*
  b, D(b)
  S1[D]: b0, D1(b1)
  S2[ ]: b0, D1(b1)
*/
describe('Implicit parent does not affect unscoped', () => {
  const cases = [
    ['BD', 'BD'],
    ['BD', 'DB'],
    ['DB', 'BD'],
    ['DB', 'DB'],
  ] as const
  test.each(cases)('level 1: %p and level 2: %p', (level1, level2) => {
    const { container } = renderWithOrder(level1, level2)
    const increaseLayer2Base = '.layer2.setBase'
    const selectors = [
      '.layer1.base',
      '.layer1.derived',
      '.layer2.base',
      '.layer2.derived',
    ]

    expect(getTextContents(container, selectors).join('')).toEqual('0000')

    clickButton(container, increaseLayer2Base)
    expect(getTextContents(container, selectors).join('')).toEqual('1010')
  })
})
