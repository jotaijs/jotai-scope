import { atom, useAtom, useAtomValue } from 'jotai';
import { ScopeProvider } from 'jotai-scope';
import { atomWithReducer } from 'jotai/vanilla/utils';
import { PropsWithChildren } from 'react';

const countAtom = atomWithReducer(0, (v) => v + 1);
const anotherCountAtom = atomWithReducer(0, (v) => v + 1);
const doubledAnotherCountAtom = atom((get) => get(anotherCountAtom) * 2);
const shouldHaveScopeAtom = atom(true);

const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [anotherCount, setAnotherCount] = useAtom(anotherCountAtom);
  const [doubledAnotherCount] = useAtom(doubledAnotherCountAtom);
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
    </>
  );
};

const Wrapper = ({ children }: PropsWithChildren) => {
  const shouldHaveScope = useAtomValue(shouldHaveScopeAtom);
  return shouldHaveScope ? (
    <ScopeProvider atoms={[anotherCountAtom]}>{children}</ScopeProvider>
  ) : (
    children
  );
};

const ScopeButton = () => {
  const [shouldHaveScope, setShouldHaveScope] = useAtom(shouldHaveScopeAtom);
  return (
    <button type="button" onClick={() => setShouldHaveScope((prev) => !prev)}>
      {shouldHaveScope ? 'Disable' : 'Enable'} Scope
    </button>
  );
};

const App = () => {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter />
      <h1>First Provider</h1>
      <Wrapper>
        <Counter />
      </Wrapper>
      <h1>Second Provider</h1>
      <Wrapper>
        <Counter />
      </Wrapper>
      <ScopeButton />
    </div>
  );
};

export default App;
