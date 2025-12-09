import { act } from 'react'
import { render } from '@testing-library/react'
import { atom, useAtom, useAtomValue } from 'jotai'
import { describe, expect, it } from 'vitest'
import { createIsolation } from '../../src/index'
import { clickButton } from '../utils'

describe('basic spec', () => {
  it('should export functions', () => {
    expect(createIsolation).toBeDefined()
  })
})

describe('createIsolation ScopeProvider', () => {
  it('should scope atoms within isolated context', () => {
    const {
      Provider,
      ScopeProvider,
      useAtomValue: useIsolatedAtomValue,
    } = createIsolation()
    const countAtom = atom(0)
    countAtom.debugLabel = 'count'

    function Counter({ className }: { className: string }) {
      const count = useIsolatedAtomValue(countAtom)
      return <div className={className}>{count}</div>
    }

    const { container } = render(
      <Provider>
        <Counter className="unscoped" />
        <ScopeProvider atoms={[[countAtom, 10]]}>
          <Counter className="scoped" />
        </ScopeProvider>
      </Provider>
    )

    expect(container.querySelector('.unscoped')!.textContent).toBe('0')
    expect(container.querySelector('.scoped')!.textContent).toBe('10')
  })

  it('should isolate scoped state from global jotai context', () => {
    const {
      Provider,
      ScopeProvider,
      useAtom: useIsolatedAtom,
    } = createIsolation()
    const countAtom = atom(0)
    countAtom.debugLabel = 'count'

    // Component using isolated hooks
    function IsolatedCounter({ className }: { className: string }) {
      const [count, setCount] = useIsolatedAtom(countAtom)
      return (
        <div className={className}>
          <span className="value">{count}</span>
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            +1
          </button>
        </div>
      )
    }

    // Component using global jotai hooks
    function GlobalCounter({ className }: { className: string }) {
      const [count, setCount] = useAtom(countAtom)
      return (
        <div className={className}>
          <span className="value">{count}</span>
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            +1
          </button>
        </div>
      )
    }

    const { container } = render(
      <>
        <GlobalCounter className="global" />
        <Provider>
          <IsolatedCounter className="isolated-unscoped" />
          <ScopeProvider atoms={[countAtom]}>
            <IsolatedCounter className="isolated-scoped" />
          </ScopeProvider>
        </Provider>
      </>
    )

    // All start at 0
    expect(container.querySelector('.global .value')!.textContent).toBe('0')
    expect(
      container.querySelector('.isolated-unscoped .value')!.textContent
    ).toBe('0')
    expect(
      container.querySelector('.isolated-scoped .value')!.textContent
    ).toBe('0')

    // Increment global - should not affect isolated
    clickButton(container, '.global button')
    expect(container.querySelector('.global .value')!.textContent).toBe('1')
    expect(
      container.querySelector('.isolated-unscoped .value')!.textContent
    ).toBe('0')
    expect(
      container.querySelector('.isolated-scoped .value')!.textContent
    ).toBe('0')

    // Increment isolated unscoped - should not affect scoped
    clickButton(container, '.isolated-unscoped button')
    expect(container.querySelector('.global .value')!.textContent).toBe('1')
    expect(
      container.querySelector('.isolated-unscoped .value')!.textContent
    ).toBe('1')
    expect(
      container.querySelector('.isolated-scoped .value')!.textContent
    ).toBe('0')

    // Increment isolated scoped - completely independent
    clickButton(container, '.isolated-scoped button')
    expect(container.querySelector('.global .value')!.textContent).toBe('1')
    expect(
      container.querySelector('.isolated-unscoped .value')!.textContent
    ).toBe('1')
    expect(
      container.querySelector('.isolated-scoped .value')!.textContent
    ).toBe('1')
  })

  it('should work with derived atoms in isolated scope', () => {
    const {
      Provider,
      ScopeProvider,
      useAtomValue: useIsolatedAtomValue,
    } = createIsolation()
    const baseAtom = atom(5)
    const derivedAtom = atom((get) => get(baseAtom) * 2)
    baseAtom.debugLabel = 'base'
    derivedAtom.debugLabel = 'derived'

    function Display({ className }: { className: string }) {
      const base = useIsolatedAtomValue(baseAtom)
      const derived = useIsolatedAtomValue(derivedAtom)
      return (
        <div className={className}>
          <span className="base">{base}</span>
          <span className="derived">{derived}</span>
        </div>
      )
    }

    const { container } = render(
      <Provider>
        <Display className="unscoped" />
        <ScopeProvider atoms={[[baseAtom, 10]]}>
          <Display className="scoped" />
        </ScopeProvider>
      </Provider>
    )

    // Unscoped: base=5, derived=10
    expect(container.querySelector('.unscoped .base')!.textContent).toBe('5')
    expect(container.querySelector('.unscoped .derived')!.textContent).toBe(
      '10'
    )

    // Scoped: base=10, derived reads scoped base=10, so derived=20
    expect(container.querySelector('.scoped .base')!.textContent).toBe('10')
    expect(container.querySelector('.scoped .derived')!.textContent).toBe('20')
  })

  it('should differentiate scoped vs unscoped atoms within a scoped context', () => {
    const {
      Provider,
      ScopeProvider,
      useAtom: useIsolatedAtom,
    } = createIsolation()
    const scopedAtom = atom(0)
    const unscopedAtom = atom(0)
    scopedAtom.debugLabel = 'scoped'
    unscopedAtom.debugLabel = 'unscoped'

    function Display({ className }: { className: string }) {
      const [scoped, setScoped] = useIsolatedAtom(scopedAtom)
      const [unscoped, setUnscoped] = useIsolatedAtom(unscopedAtom)
      return (
        <div className={className}>
          <span className="scoped-value">{scoped}</span>
          <span className="unscoped-value">{unscoped}</span>
          <button
            className="inc-scoped"
            type="button"
            onClick={() => setScoped((c) => c + 1)}>
            +scoped
          </button>
          <button
            className="inc-unscoped"
            type="button"
            onClick={() => setUnscoped((c) => c + 1)}>
            +unscoped
          </button>
        </div>
      )
    }

    const { container } = render(
      <Provider>
        <Display className="outer" />
        <ScopeProvider atoms={[scopedAtom]}>
          <Display className="inner" />
        </ScopeProvider>
      </Provider>
    )
    function readValue(selector: string) {
      return container.querySelector(selector)!.textContent
    }

    expect(readValue('.outer .scoped-value')).toBe('0')
    expect(readValue('.outer .unscoped-value')).toBe('0')
    expect(readValue('.inner .scoped-value')).toBe('0')
    expect(readValue('.inner .unscoped-value')).toBe('0')

    act(() => clickButton(container, '.inner .inc-scoped'))
    expect(readValue('.outer .scoped-value')).toBe('0')
    expect(readValue('.inner .scoped-value')).toBe('1')

    act(() => clickButton(container, '.inner .inc-unscoped'))
    expect(readValue('.outer .unscoped-value')).toBe('1')
    expect(readValue('.inner .unscoped-value')).toBe('1')

    act(() => clickButton(container, '.outer .inc-scoped'))
    expect(readValue('.outer .scoped-value')).toBe('1')
    expect(readValue('.inner .scoped-value')).toBe('1')
  })
})
