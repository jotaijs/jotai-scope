import { atom, useAtom } from 'jotai'
import { ScopeProvider } from 'jotai-scope'

const baseAtom = atom(0)
const derivedAtom1 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1)
  },
)

const derivedAtom2 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1)
  },
)

function Counter({ counterClass }: { counterClass: string }) {
  const [base, setBase] = useAtom(baseAtom)
  const [derived1, setDerived1] = useAtom(derivedAtom1)
  const [derived2, setDerived2] = useAtom(derivedAtom2)
  return (
    <>
      <div>
        base: <span className={`${counterClass} base`}>{base}</span>
        <button
          className={`${counterClass} setBase`}
          type="button"
          onClick={() => setBase((c) => c + 1)}
        >
          increment
        </button>
      </div>
      <div>
        derived1: <span className={`${counterClass} derived1`}>{derived1}</span>
        <button
          className={`${counterClass} setDerived1`}
          type="button"
          onClick={() => setDerived1()}
        >
          increment
        </button>
      </div>
      <div>
        derived2: <span className={`${counterClass} derived2`}>{derived2}</span>
        <button
          className={`${counterClass} setDerived2`}
          type="button"
          onClick={() => setDerived2()}
        >
          increment
        </button>
      </div>
    </>
  )
}

function App() {
  return (
    <div>
      <h1>Only base is scoped</h1>
      <p>derived1 and derived2 should also be scoped</p>
      <ScopeProvider atoms={[baseAtom]}>
        <Counter counterClass="case1" />
      </ScopeProvider>
      <h1>Both derived1 an derived2 are scoped</h1>
      <p>base should be global, derived1 and derived2 are shared</p>
      <ScopeProvider atoms={[derivedAtom1, derivedAtom2]}>
        <Counter counterClass="case2" />
      </ScopeProvider>
      <h1>Layer1: Only derived1 is scoped</h1>
      <p>base and derived2 should be global</p>
      <ScopeProvider atoms={[derivedAtom1]}>
        <Counter counterClass="layer1" />
        <h2>Layer2: Base and derived2 are scoped</h2>
        <p>derived1 should use layer1&apos;s atom, base and derived2 are layer 2 scoped</p>
        <ScopeProvider atoms={[baseAtom, derivedAtom2]}>
          <Counter counterClass="layer2" />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  )
}

export default App
