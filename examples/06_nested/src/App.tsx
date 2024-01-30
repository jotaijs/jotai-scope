import { atom, useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';
import { atomWithReducer } from 'jotai/vanilla/utils';

const countAtom = atomWithReducer(0, (v) => v + 1);
const anotherCountAtom = atomWithReducer(0, (v) => v + 1);
const doubledAnotherCountAtom = atom((get) => get(anotherCountAtom) * 2);
const proxyAtom = atom(0, (_get, set, v: number) => {
  set(proxyAtom, v);
  set(countAtom);
  set(anotherCountAtom);
});

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [anotherCount, setAnotherCount] = useAtom(anotherCountAtom);
  const [doubledAnotherCount] = useAtom(doubledAnotherCountAtom);
  const [proxy, setProxy] = useAtom(proxyAtom);
  return (
    <>
      <div>
        <span>count: {count}</span>
        <button type="button" onClick={() => setCount()}>
          increment
        </button>
      </div>
      <div>
        <span>
          another count: {anotherCount} (doubled: {doubledAnotherCount})
        </span>
        <button type="button" onClick={() => setAnotherCount()}>
          increment
        </button>
      </div>
      <div>
        <span>proxy: {proxy}</span>
        <button type="button" onClick={() => setProxy(proxy + 1)}>
          increment both via proxy
        </button>
      </div>
    </>
  );
};

const App = () => {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter />
      <h1>Scope count</h1>
      <ScopeProvider atoms={[countAtom]}>
        <Counter />
        <h1>Nested scope another count</h1>
        <ScopeProvider atoms={[anotherCountAtom]}>
          <Counter />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

export default App;
