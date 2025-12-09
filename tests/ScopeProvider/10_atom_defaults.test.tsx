import { render } from '@testing-library/react'
import { atom, useAtomValue } from 'jotai'
import { describe, expect, test, vi } from 'vitest'
import { ScopeProvider } from 'jotai-scope'

describe('ScopeProvider atom defaults', () => {
  test('atoms defaults are applied without an extra render', () => {
    const a = atom(0)
    const b = atom(0)
    const c = atom(0)
    a.debugLabel = 'a'
    b.debugLabel = 'b'
    c.debugLabel = 'c'
    const Component = vi.fn(() => (
      <>
        <div className="a">{useAtomValue(a)}</div>
        <div className="b">{useAtomValue(b)}</div>
        <div className="c">{useAtomValue(c)}</div>
      </>
    ))
    function getValues(container: HTMLElement) {
      return String(['a', 'b', 'c'].map((className) => container.querySelector(`.${className}`)!.textContent))
    }
    {
      // without defaults
      const { container } = render(
        <ScopeProvider name="withoutDefaults" atoms={[a, b]}>
          <Component />
        </ScopeProvider>
      )
      expect(getValues(container)).toBe('0,0,0')
      expect(Component).toHaveBeenCalledTimes(2)
    }
    vi.clearAllMocks()
    {
      // with defaults
      const { container } = render(
        <ScopeProvider
          name="withDefaults"
          atoms={[
            [a, 1],
            [b, 2],
          ]}>
          <Component />
        </ScopeProvider>
      )
      expect(getValues(container)).toBe('1,2,0')
      // Component is normally rendered twice,
      // adding defaults does not add an extra render
      expect(Component).toHaveBeenCalledTimes(2)
    }
  })
})
