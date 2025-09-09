import { render } from '@testing-library/react'
import { Provider, atom, useAtomValue } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'
import { createDebugStore } from './utils'

describe.skip('atomEffect', () => {
  test('should work with atomEffect', () => {
    // const effect = vi.fn()
    const a = atom(0)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a, (v) => v + 1)
    })
    e.debugLabel = 'effect'
    const s0 = createDebugStore('s0')

    function Component() {
      useAtomValue(e)
      const v = useAtomValue(a)
      return <div className="value">{v}</div>
    }
    const { container } = render(
      <Provider store={s0}>
        <ScopeProvider atoms={[a]} name="S1">
          <Component />
        </ScopeProvider>
      </Provider>
    )
    expect(container.querySelector('.value')!.textContent).toBe('1')
    expect(s0.get(a)).toBe(0)
  })
})
