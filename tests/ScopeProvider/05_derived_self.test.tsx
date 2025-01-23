import { render } from '@testing-library/react'
import { atom, useAtom } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { getTextContents } from '../utils'

const baseAtom = atom(0)
const derivedAtom1 = atom(
  (get) => get(baseAtom),
  (get): number => {
    return get(derivedAtom1)
  }
)

function Component({
  className,
  initialValue = 0,
}: {
  className: string
  initialValue?: number
}) {
  useHydrateAtoms([[baseAtom, initialValue]])
  const [atom1ReadValue, setAtom1Value] = useAtom(derivedAtom1)
  const atom1WriteValue = setAtom1Value()
  return (
    <div className={className}>
      <span className="read">{atom1ReadValue}</span>
      <span className="write">{atom1WriteValue}</span>
    </div>
  )
}

function App() {
  return (
    <>
      <h1>base component</h1>
      <p>derived1 should read itself from global scope</p>
      <Component className="unscoped" />
      <ScopeProvider atoms={[baseAtom]}>
        <h1>scoped component</h1>
        <p>derived1 should read itself from scoped scope</p>
        <Component className="scoped" initialValue={1} />
      </ScopeProvider>
    </>
  )
}

describe('Self', () => {
  /*
    baseA, derivedB(baseA, derivedB)
    S1[baseA]: baseA1, derivedB0(baseA1, derivedB0)
  */
  test('derived dep scope is preserved in self reference', () => {
    const { container } = render(<App />)
    expect(
      getTextContents(container, ['.unscoped .read', '.unscoped .write'])
    ).toEqual(['0', '0'])

    expect(
      getTextContents(container, ['.scoped .read', '.scoped .write'])
    ).toEqual(['1', '1'])
  })
})
