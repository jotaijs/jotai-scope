import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';

const countAtom = atom(0);
const anotherCountAtom = atom(0);
const doubledAnotherCountAtom = atom((get) => get(anotherCountAtom) * 2);

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [anotherCount, setAnotherCount] = useAtom(anotherCountAtom);
  const [doubledAnotherCount] = useAtom(doubledAnotherCountAtom);
  return (
    <>
      <div>
        <span>count: {count}</span>
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>
          another count: {anotherCount} (doubled: {doubledAnotherCount})
        </span>
        <button type="button" onClick={() => setAnotherCount((c) => c + 1)}>
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
      <ScopeProvider atoms={[anotherCountAtom]}>
        <Counter />
      </ScopeProvider>
      <h1>Second Provider</h1>
      <ScopeProvider atoms={[anotherCountAtom]}>
        <Counter />
      </ScopeProvider>
    </div>
  );
};

export default App;
