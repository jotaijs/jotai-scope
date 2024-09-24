import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ScopeProvider } from 'jotai-scope'
import { atomWithReducer } from 'jotai/vanilla/utils'

const baseAtom1 = atomWithReducer(0, (v) => v + 1)
const baseAtom2 = atomWithReducer(0, (v) => v + 1)
const baseAtom = atom(0)

const writeProxyAtom = atom('unused', (get, set) => {
  set(baseAtom, get(baseAtom) + 1)
  set(baseAtom1)
  set(baseAtom2)
})

function Counter({ counterClass }: { counterClass: string }) {
  const [base1, increaseBase1] = useAtom(baseAtom1)
  const [base2, increaseBase2] = useAtom(baseAtom2)
  const base = useAtomValue(baseAtom)
  const increaseAll = useSetAtom(writeProxyAtom)
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
      <div>
        base: <span className={`${counterClass} base`}>{base}</span>
      </div>
      <button className={`${counterClass} setAll`} type="button" onClick={() => increaseAll()}>
        increase all three atoms
      </button>
    </>
  )
}

function App() {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter counterClass="unscoped" />
      <h1>Layer 1: Scope base 1</h1>
      <p>base 2 and base should be globally shared</p>
      <ScopeProvider atoms={[baseAtom1]}>
        <Counter counterClass="layer1" />
        <h1>Layer 2: Scope base 2</h1>
        <p>base 1 should be shared between layer 1 and layer 2, base should be globally shared</p>
        <ScopeProvider atoms={[baseAtom2]}>
          <Counter counterClass="layer2" />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  )
}

export default App
