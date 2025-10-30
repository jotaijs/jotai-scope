import { render } from '@testing-library/react'
import { Provider, createStore, useAtomValue } from 'jotai'
import { atomWithReducer } from 'jotai/utils'
import { atomEffect } from 'jotai-effect'
import { ScopeProvider } from 'jotai-scope'
import { atomWithReducer } from 'jotai/utils'
// eslint-disable-next-line import/order
import { describe, expect, test } from 'vitest'

describe('atomEffect', () => {
  test('should work with atomEffect', () => {
    const a = atomWithReducer(0, (v) => v + 1)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => set(a))
    e.debugLabel = 'effect'
    const s0 = createStore()
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
