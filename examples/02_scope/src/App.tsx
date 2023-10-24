import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';

const countAtom = atom(0);
const anotherCountAtom = atom(0);

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [anotherCount, setAnotherCount] = useAtom(anotherCountAtom);
  return (
    <>
      <div>
        <span>count: {count}</span>
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          increment
        </button>
      </div>
      <div>
        <span>another count: {anotherCount}</span>
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
