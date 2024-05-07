import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';
import { atomWithReducer } from 'jotai/vanilla/utils';

const baseAtom1 = atomWithReducer(0, (v) => v + 1);
const baseAtom2 = atomWithReducer(0, (v) => v + 1);
const baseAtom = atom(0);

const writeProxyAtom = atom('unused', (get, set) => {
  set(baseAtom, get(baseAtom) + 1);
  set(baseAtom1);
  set(baseAtom2);
});

const Counter = () => {
  const [base1, incrementBase1] = useAtom(baseAtom1);
  const [base2, incrementBase2] = useAtom(baseAtom2);
  const base = useAtomValue(baseAtom);
  const incrementAll = useSetAtom(writeProxyAtom);
  return (
    <>
      <div>
        <span>base 1: {base1}</span>
        <button type="button" onClick={() => incrementBase1()}>
          increment
        </button>
      </div>
      <div>
        <span>base 2: {base2}</span>
        <button type="button" onClick={() => incrementBase2()}>
          increment
        </button>
      </div>
      <div>
        <span>base: {base}</span>
      </div>
      <button type="button" onClick={() => incrementAll()}>
        increment all three atoms
      </button>
    </>
  );
};

const App = () => {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter />
      <h1>Layer 1: Scope base 1</h1>
      <p>base 2 and base should be globally shared</p>
      <ScopeProvider atoms={[baseAtom1]}>
        <Counter />
        <h1>Layer 2: Scope base 2</h1>
        <p>
          base 1 should be shared between layer 1 and layer 2, base should be
          globally shared
        </p>
        <ScopeProvider atoms={[baseAtom2]}>
          <Counter />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

export default App;
