import { atom, useAtom, useAtomValue } from 'jotai'
import { ScopeProvider } from 'jotai-scope'
import { atomWithReducer } from 'jotai/vanilla/utils'
import { PropsWithChildren } from 'react'

const baseAtom1 = atomWithReducer(0, (v) => v + 1)
const baseAtom2 = atomWithReducer(0, (v) => v + 1)
const shouldHaveScopeAtom = atom(true)

function Counter({ counterClass }: { counterClass: string }) {
  const [base1, increaseBase1] = useAtom(baseAtom1)
  const [base2, increaseBase2] = useAtom(baseAtom2)
  return (
    <>
      <div>
        base1: <span className={`${counterClass} base1`}>{base1}</span>
        <button
          className={`${counterClass} setBase1`}
          type="button"
          onClick={() => increaseBase1()}
        >
          increase
        </button>
      </div>
      <div>
        base2: <span className={`${counterClass} base2`}>{base2}</span>
        <button
          className={`${counterClass} setBase2`}
          type="button"
          onClick={() => increaseBase2()}
        >
          increase
        </button>
      </div>
    </>
  )
}

function Wrapper({ children }: PropsWithChildren) {
  const shouldHaveScope = useAtomValue(shouldHaveScopeAtom)
  return shouldHaveScope ? <ScopeProvider atoms={[baseAtom2]}>{children}</ScopeProvider> : children
}

function ScopeButton() {
  const [shouldHaveScope, setShouldHaveScope] = useAtom(shouldHaveScopeAtom)
  return (
    <button id="toggleScope" type="button" onClick={() => setShouldHaveScope((prev) => !prev)}>
      {shouldHaveScope ? 'Disable' : 'Enable'} Scope
    </button>
  )
}

function App() {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter counterClass="unscoped" />
      <h1>Scoped Provider</h1>
      <Wrapper>
        <Counter counterClass="scoped" />
      </Wrapper>
      <ScopeButton />
    </div>
  )
}

export default App
