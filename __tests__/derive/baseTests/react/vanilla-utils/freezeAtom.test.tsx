import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'
import { freezeAtom, freezeAtomCreator } from 'jotai/vanilla/utils'

it('freezeAtom basic test', async () => {
  const objAtom = atom({ deep: {} }, (_get, set, _ignored?) => {
    set(objAtom, { deep: {} })
  })

  function Component() {
    const [obj, setObj] = useAtom(freezeAtom(objAtom))
    return (
      <>
        <button onClick={setObj}>change</button>
        <div>isFrozen: {`${Object.isFrozen(obj) && Object.isFrozen(obj.deep)}`}</div>
      </>
    )
  }

  const { getByText, findByText } = render(
    <StrictMode>
      <Component />
    </StrictMode>,
  )

  await findByText('isFrozen: true')

  await userEvent.click(getByText('change'))
  await findByText('isFrozen: true')
})

describe('freezeAtomCreator', () => {
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

  it('freezeAtomCreator basic test', async () => {
    const createFrozenAtom = freezeAtomCreator(atom)
    const objAtom = createFrozenAtom({ deep: {} }, (_get, set, _ignored?) => {
      set(objAtom, { deep: {} })
    })

    function Component() {
      const [obj, setObj] = useAtom(objAtom)
      return (
        <>
          <button onClick={setObj}>change</button>
          <div>isFrozen: {`${Object.isFrozen(obj) && Object.isFrozen(obj.deep)}`}</div>
        </>
      )
    }

    const { getByText, findByText } = render(
      <StrictMode>
        <Component />
      </StrictMode>,
    )

    await findByText('isFrozen: true')

    await userEvent.click(getByText('change'))
    await findByText('isFrozen: true')
  })
})
