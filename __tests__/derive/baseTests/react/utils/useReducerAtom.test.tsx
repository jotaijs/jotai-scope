import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducerAtom } from 'jotai/react/utils'
import { atom } from 'jotai/vanilla'

let savedConsoleWarn: any
beforeEach(() => {
  // eslint-disable-next-line no-console
  savedConsoleWarn = console.warn
  // eslint-disable-next-line no-console
  console.warn = jest.fn()
})
afterEach(() => {
  // eslint-disable-next-line no-console
  console.warn = savedConsoleWarn
})

it('useReducerAtom with no action argument', async () => {
  const countAtom = atom(0)
  const reducer = (state: number) => state + 2

  function Parent() {
    const [count, dispatch] = useReducerAtom(countAtom, reducer)
    return (
      <>
        <div>count: {count}</div>
        <button onClick={() => dispatch()}>dispatch</button>
      </>
    )
  }

  const { findByText, getByText } = render(
    <StrictMode>
      <Parent />
    </StrictMode>,
  )

  await findByText('count: 0')

  await userEvent.click(getByText('dispatch'))
  await findByText('count: 2')

  await userEvent.click(getByText('dispatch'))
  await findByText('count: 4')
})

it('useReducerAtom with optional action argument', async () => {
  const countAtom = atom(0)
  const reducer = (state: number, action?: 'INCREASE' | 'DECREASE') => {
    switch (action) {
      case 'INCREASE':
        return state + 1
      case 'DECREASE':
        return state - 1
      case undefined:
      default:
        return state
    }
  }

  function Parent() {
    const [count, dispatch] = useReducerAtom(countAtom, reducer)
    return (
      <>
        <div>count: {count}</div>
        <button onClick={() => dispatch('INCREASE')}>dispatch INCREASE</button>
        <button onClick={() => dispatch('DECREASE')}>dispatch DECREASE</button>
        <button onClick={() => dispatch()}>dispatch empty</button>
      </>
    )
  }

  const { findByText, getByText } = render(
    <StrictMode>
      <Parent />
    </StrictMode>,
  )

  await findByText('count: 0')

  await userEvent.click(getByText('dispatch INCREASE'))
  await findByText('count: 1')

  await userEvent.click(getByText('dispatch empty'))
  await findByText('count: 1')

  await userEvent.click(getByText('dispatch DECREASE'))
  await findByText('count: 0')
})

it('useReducerAtom with non-optional action argument', async () => {
  const countAtom = atom(0)
  const reducer = (state: number, action: 'INCREASE' | 'DECREASE') => {
    switch (action) {
      case 'INCREASE':
        return state + 1
      case 'DECREASE':
      default:
        return state - 1
    }
  }

  function Parent() {
    const [count, dispatch] = useReducerAtom(countAtom, reducer)
    return (
      <>
        <div>count: {count}</div>
        <button onClick={() => dispatch('INCREASE')}>dispatch INCREASE</button>
        <button onClick={() => dispatch('DECREASE')}>dispatch DECREASE</button>
      </>
    )
  }

  const { findByText, getByText } = render(
    <StrictMode>
      <Parent />
    </StrictMode>,
  )

  await findByText('count: 0')

  await userEvent.click(getByText('dispatch INCREASE'))
  await findByText('count: 1')

  await userEvent.click(getByText('dispatch DECREASE'))
  await findByText('count: 0')
})
