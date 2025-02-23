import { act, render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'src/ScopeProvider/ScopeProvider'
import { atom, useAtom, useSetAtom } from '../../jotai'
import { atomFamily, atomWithReducer } from '../../jotai/utils'
import { clickButton, getTextContents } from './utils'

describe('AtomFamily with ScopeProvider', () => {
  /*
    a = aFamily('a'), b = aFamily('b')
    S0[]: a0 b0
    S1[aFamily]: a1 b1
  */
  test('01. Scoped atom families provide isolated state', function test() {
    const aFamily = atomFamily(() => atom(0))
    const aAtom = aFamily('a')
    aAtom.debugLabel = 'aAtom'
    const bAtom = aFamily('b')
    bAtom.debugLabel = 'bAtom'
    function Counter({ level, param }: { level: string; param: string }) {
      const [value, setValue] = useAtom(aFamily(param))
      return (
        <div>
          {param}:<span className={`${level} ${param}`}>{value}</span>
          <button
            className={`${level} set-${param}`}
            type="button"
            onClick={() => setValue((c) => c + 1)}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" param="a" />
          <Counter level="level0" param="b" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atomFamilies={[aFamily]} debugName="level1">
            <Counter level="level1" param="a" />
            <Counter level="level1" param="b" />
          </ScopeProvider>
        </div>
      )
    }

    const { container } = render(<App />)
    const selectors = ['.level0.a', '.level0.b', '.level1.a', '.level1.b']

    expect(getTextContents(container, selectors)).toEqual([
      '0', // level0 a
      '0', // level0 b
      '0', // level1 a
      '0', // level1 b
    ])

    clickButton(container, '.level0.set-a')
    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '0', // level0 b
      '0', // level1 a
      '0', // level1 b
    ])

    clickButton(container, '.level1.set-a')
    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '0', // level0 b
      '1', // level1 a
      '0', // level1 b
    ])

    clickButton(container, '.level1.set-b')
    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '0', // level0 b
      '1', // level1 a
      '1', // level1 b
    ])
  })

  /*
    aFamily('a'), aFamily.remove('a')
    S0[aFamily('a')]: a0 -> removed
    S1[aFamily('a')]: a1
  */
  // TODO: refactor atomFamily to support descoping removing atoms
  test.skip('02. Removing atom from atomFamily does not affect scoped state', () => {
    const aFamily = atomFamily(() => atom(0))
    const atomA = aFamily('a')
    atomA.debugLabel = 'atomA'
    const rerenderAtom = atomWithReducer(0, (s) => s + 1)
    rerenderAtom.debugLabel = 'rerenderAtom'
    function Counter({ level, param }: { level: string; param: string }) {
      const [value, setValue] = useAtom(atomA)
      useAtom(rerenderAtom)
      return (
        <div>
          {param}:<span className={`${level} ${param}`}>{value}</span>
          <button
            className={`${level} set-${param}`}
            type="button"
            onClick={() => setValue((c) => c + 1)}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      const rerender = useSetAtom(rerenderAtom)
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" param="a" />
          <button
            className="remove-atom"
            type="button"
            onClick={() => {
              aFamily.remove('a')
              rerender()
            }}>
            remove a from atomFamily
          </button>
          <h1>Scoped Provider</h1>
          <ScopeProvider atomFamilies={[aFamily]} debugName="level1">
            <Counter level="level1" param="a" />
          </ScopeProvider>
        </div>
      )
    }

    const { container } = render(<App />)
    const selectors = ['.level0.a', '.level1.a']

    expect(getTextContents(container, selectors)).toEqual([
      '0', // level0 a
      '0', // level1 a
    ])

    clickButton(container, '.level0.set-a')
    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '0', // level1 a
    ])

    act(() => {
      clickButton(container, '.remove-atom')
    })

    expect(getTextContents(container, ['.level0.a', '.level1.a'])).toEqual([
      '1', // level0 a
      '1', // level1 a // atomA is now unscoped
    ])

    clickButton(container, '.level1.set-a')
    expect(getTextContents(container, ['.level0.a', '.level1.a'])).toEqual([
      '2', // level0 a
      '2', // level1 a
    ])
  })

  /*
    aFamily.setShouldRemove((createdAt, param) => param === 'b')
    S0[aFamily('a'), aFamily('b')]: a0 removed
    S1[aFamily('a'), aFamily('b')]: a1 b1
  */
  // TODO: refactor atomFamily to support descoping removing atoms
  test.skip('03. Scoped atom families respect custom removal conditions', () => {
    const aFamily = atomFamily(() => atom(0))
    const atomA = aFamily('a')
    atomA.debugLabel = 'atomA'
    const atomB = aFamily('b')
    atomB.debugLabel = 'atomB'
    const rerenderAtom = atomWithReducer(0, (s) => s + 1)
    rerenderAtom.debugLabel = 'rerenderAtom'

    function Counter({ level, param }: { level: string; param: string }) {
      const [value, setValue] = useAtom(aFamily(param))
      useAtom(rerenderAtom)
      return (
        <div>
          {param}:<span className={`${level} ${param}`}>{value}</span>
          <button
            className={`${level} set-${param}`}
            type="button"
            onClick={() => setValue((c) => c + 1)}>
            increase
          </button>
        </div>
      )
    }

    function App() {
      const rerender = useSetAtom(rerenderAtom)
      return (
        <div>
          <button
            className="remove-b"
            type="button"
            onClick={() => {
              aFamily.setShouldRemove((_, param) => param === 'b')
              rerender()
            }}>
            remove b from atomFamily
          </button>
          <h1>Unscoped</h1>
          <Counter level="level0" param="a" />
          <Counter level="level0" param="b" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atomFamilies={[aFamily]} debugName="level1">
            <Counter level="level1" param="a" />
            <Counter level="level1" param="b" />
          </ScopeProvider>
        </div>
      )
    }

    const { container } = render(<App />)
    const removeBButton = '.remove-b'
    const selectors = ['.level0.a', '.level0.b', '.level1.a', '.level1.b']

    expect(getTextContents(container, selectors)).toEqual([
      '0', // level0 a
      '0', // level0 b
      '0', // level1 a
      '0', // level1 b
    ])

    clickButton(container, '.level0.set-a')
    clickButton(container, '.level0.set-b')
    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '1', // level0 b
      '0', // level1 a // a is scoped
      '0', // level1 b // b is scoped
    ])

    act(() => {
      clickButton(container, removeBButton)
    })

    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 a
      '1', // level0 b
      '0', // level1 a // a is still scoped
      '1', // level1 b // b is no longer scoped
    ])
  })
})
