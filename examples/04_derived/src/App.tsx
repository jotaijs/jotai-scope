import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';

const baseAtom = atom(0);
const derivedAtom1 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1);
  },
);

const derivedAtom2 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1);
  },
);

derivedAtom1.debugLabel = 'label';

const Counter = () => {
  const [base, setBase] = useAtom(baseAtom);
  const [derived1, setDerived1] = useAtom(derivedAtom1);
  const [derived2, setDerived2] = useAtom(derivedAtom2);
  return (
    <>
      <div>
        <span>base count: {base}</span>
        <button type="button" onClick={() => setBase((c) => c + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>derived1 count: {derived1}</span>
        <button type="button" onClick={() => setDerived1()}>
          increment
        </button>
      </div>
      <div>
        <span>derived2 count: {derived2}</span>
        <button type="button" onClick={() => setDerived2()}>
          increment
        </button>
      </div>
    </>
  );
};

const App = () => {
  return (
    <div>
      <h1>Only base is scoped</h1>
      <p>derived1 and derived2 should also be scoped</p>
      <ScopeProvider atoms={[baseAtom]}>
        <Counter />
      </ScopeProvider>
      <h1>Both derived1 an derived2 are scoped</h1>
      <p>base should be global, derived1 and derived2 are shared</p>
      <ScopeProvider atoms={[derivedAtom1, derivedAtom2]}>
        <Counter />
      </ScopeProvider>
      <h1>Layer1: Only derived1 is scoped</h1>
      <p>base and derived2 should be global</p>
      <ScopeProvider atoms={[derivedAtom1]}>
        <Counter />
        <h2>Layer2: Base and derived2 are scoped</h2>
        <p>
          derived1 should use layer1&apos;s atom, base and derived2 are layer 2
          scoped
        </p>
        <ScopeProvider atoms={[baseAtom, derivedAtom2]}>
          <Counter />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

export default App;
