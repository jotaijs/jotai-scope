import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';

function customAtom<T>(initialValue: T) {
  const valueAtom = atom<T>(initialValue);
  return atom(
    (get) => get(valueAtom),
    (_get, set, update: T) => set(valueAtom, update),
  );
}

const anotherCountAtom = atom(0);
const someCustomAtom = customAtom(0);

const Counter = () => {
  const [anotherCount, setAnotherCount] = useAtom(anotherCountAtom);
  const [someCustomCount, setCustomCount] = useAtom(someCustomAtom);
  return (
    <>
      <div>
        <span>another count: {anotherCount}</span>
        <button type="button" onClick={() => setAnotherCount((c) => c + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>custom atom count: {someCustomCount}</span>
        <button
          type="button"
          onClick={() => setCustomCount(someCustomCount + 1)}
        >
          increment
        </button>
      </div>
    </>
  );
};

const App = () => {
  return (
    <div>
      <h1>First Provider</h1>
      <ScopeProvider atoms={[anotherCountAtom, someCustomAtom]}>
        <Counter />
      </ScopeProvider>
      <h1>Second Provider</h1>
      <ScopeProvider atoms={[anotherCountAtom, someCustomAtom]}>
        <Counter />
      </ScopeProvider>
    </div>
  );
};

export default App;
