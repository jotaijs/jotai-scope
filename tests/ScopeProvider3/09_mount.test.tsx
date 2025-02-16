import { useState } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScopeProvider } from 'src/ScopeProvider3/ScopeProvider'
import { atom, useAtomValue } from '../../jotai'
import { clickButton } from './utils'

describe('ScopeProvider', () => {
  it('mounts and unmounts successfully', () => {
    const baseAtom = atom(0)
    function Component() {
      const base = useAtomValue(baseAtom)
      return <div className="base">{base}</div>
    }
    function App() {
      const [isMounted, setIsMounted] = useState(false)
      return (
        <>
          <div>
            <button
              className="mount"
              type="button"
              onClick={() => setIsMounted((t) => !t)}>
              Mount
            </button>
          </div>
          {isMounted && (
            <ScopeProvider atoms={[baseAtom]}>
              <Component />
            </ScopeProvider>
          )}
        </>
      )
    }
    const { unmount, container } = render(<App />)
    const mountButton = '.mount'
    const base = '.base'

    act(() => clickButton(container, mountButton))
    expect(container.querySelector(base)).not.toBe(null)
    act(() => clickButton(container, mountButton))
    expect(container.querySelector(base)).toBe(null)
    act(() => clickButton(container, mountButton))
    unmount()
    expect(container.querySelector(base)).toBe(null)
  })
})

it('computed atom mounts once for the unscoped and once for the scoped', () => {
  const baseAtom = atom(0)
  const deriveAtom = atom(
    (get) => get(baseAtom),
    () => {}
  )
  const onUnmount = vi.fn()
  const onMount = vi.fn(() => onUnmount)
  deriveAtom.onMount = onMount
  function Component() {
    return useAtomValue(deriveAtom)
  }
  function App() {
    return (
      <>
        <Component />
        <Component />
        <ScopeProvider atoms={[baseAtom]}>
          <Component />
          <Component />
        </ScopeProvider>
      </>
    )
  }
  const { unmount } = render(<App />)
  expect(onMount).toHaveBeenCalledTimes(1)
  unmount()
  expect(onUnmount).toHaveBeenCalledTimes(1)
})
