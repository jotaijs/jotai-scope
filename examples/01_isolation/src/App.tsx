import { atom, useAtom } from 'jotai';
import { createIsolation } from 'jotai-scope';

const { Provider: MyProvider, useAtom: useMyAtom } = createIsolation();

const countAtom = atom(0);

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  return (
    <div>
      <span>count: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        increment
      </button>
    </div>
  );
};

const ScopedCounter = () => {
  const [count, setCount] = useMyAtom(countAtom);
  return (
    <div>
      <span>scoped count: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        increment
      </button>
    </div>
  );
};

const App = () => {
  return (
    <div>
      <h1>First Provider</h1>
      <MyProvider>
        <Counter />
        <ScopedCounter />
      </MyProvider>
      <h1>Second Provider</h1>
      <MyProvider>
        <Counter />
        <ScopedCounter />
      </MyProvider>
    </div>
  );
};

export default App;
