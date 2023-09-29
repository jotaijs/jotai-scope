import { atom, useAtom } from 'jotai';
import {
  Provider as ScopedProvider,
  useAtom as useScopedAtom,
} from 'jotai-scope';

const countAtom = atom(0);
const anotherCountAtom = atom(0);

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [anotherCount, setAnotherCount] = useScopedAtom(anotherCountAtom);
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
      <ScopedProvider atoms={[anotherCountAtom]}>
        <Counter />
      </ScopedProvider>
      <h1>Second Provider</h1>
      <ScopedProvider atoms={[anotherCountAtom]}>
        <Counter />
      </ScopedProvider>
    </div>
  );
};

export default App;
