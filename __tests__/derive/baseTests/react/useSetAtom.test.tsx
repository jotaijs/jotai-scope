import { StrictMode, useEffect, useRef } from 'react'
import type { PropsWithChildren } from 'react'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAtomValue, useSetAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'

const useCommitCount = () => {
  const commitCountRef = useRef(1)
  useEffect(() => {
    commitCountRef.current += 1
  })
  return commitCountRef.current
}

it('useSetAtom does not trigger rerender in component', async () => {
  const countAtom = atom(0)

  function Displayer() {
    const count = useAtomValue(countAtom)
    const commits = useCommitCount()
    return (
      <div>
        count: {count}, commits: {commits}
      </div>
    )
  }

  function Updater() {
    const setCount = useSetAtom(countAtom)
    const commits = useCommitCount()
    return (
      <>
        <button onClick={() => setCount((value) => value + 1)}>increment</button>
        <div>updater commits: {commits}</div>
      </>
    )
  }

  function Parent() {
    return (
      <>
        <Displayer />
        <Updater />
      </>
    )
  }

  const { getByText } = render(<Parent />)

  await waitFor(() => {
    getByText('count: 0, commits: 1')
    getByText('updater commits: 1')
  })
  await userEvent.click(getByText('increment'))
  await waitFor(() => {
    getByText('count: 1, commits: 2')
    getByText('updater commits: 1')
  })
  await userEvent.click(getByText('increment'))
  await waitFor(() => {
    getByText('count: 2, commits: 3')
    getByText('updater commits: 1')
  })
  await userEvent.click(getByText('increment'))
  await waitFor(() => {
    getByText('count: 3, commits: 4')
    getByText('updater commits: 1')
  })
})

it('useSetAtom with write without an argument', async () => {
  const countAtom = atom(0)
  const incrementCountAtom = atom(null, (get, set) => set(countAtom, get(countAtom) + 1))

  function Button({ cb, children }: PropsWithChildren<{ cb: () => void }>) {
    return <button onClick={cb}>{children}</button>
  }

  function Displayer() {
    const count = useAtomValue(countAtom)
    return <div>count: {count}</div>
  }

  function Updater() {
    const setCount = useSetAtom(incrementCountAtom)
    return <Button cb={setCount}>increment</Button>
  }

  function Parent() {
    return (
      <>
        <Displayer />
        <Updater />
      </>
    )
  }
  const { getByText } = render(
    <StrictMode>
      <Parent />
    </StrictMode>,
  )

  await waitFor(() => {
    getByText('count: 0')
  })
  await userEvent.click(getByText('increment'))
  await waitFor(() => {
    getByText('count: 1')
  })
})
