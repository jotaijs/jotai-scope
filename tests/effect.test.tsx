import { render } from '@testing-library/react'
import { Provider, atom, createStore, useAtomValue } from 'jotai'
import { INTERNAL_getBuildingBlocksRev1 } from 'jotai/vanilla/internals'
import { atomEffect } from 'jotai-effect'
import { describe, expect, test } from 'vitest'
import { ScopeProvider } from 'jotai-scope'

describe('atomEffect', () => {
  test('should work with atomEffect', () => {
    // const effect = vi.fn()
    const a = atom(0)
    a.debugLabel = 'atomA'
    const e = atomEffect((_get, set) => {
      set(a, (v) => v + 1)
    })
    e.debugLabel = 'effect'
    const s0 = createStore()
    ;(s0 as any).name = 's0'
    ;(globalThis as any).atomStateMap = INTERNAL_getBuildingBlocksRev1(s0)[0]

    function Component() {
      useAtomValue(e)
      const v = useAtomValue(a)
      return <div className="value">{v}</div>
    }
    const { container } = render(
      <Provider store={s0}>
        <ScopeProvider atoms={[a]} debugName="S1">
          <Component />
        </ScopeProvider>
      </Provider>
    )
    expect(container.querySelector('.value')!.textContent).toBe('1')
    expect(s0.get(a)).toBe(0)
  })
})
