import { useAtom } from 'jotai';
import { ScopeProvider } from 'jotai-scope';
import { atomWithReducer } from 'jotai/vanilla/utils';

function createCountAtom() {
  type State = number;
  type Action = '+1' | '-1';

  const reducer = (prev: State, action: Action) => {
    switch (action) {
      case '+1':
        return prev + 1;
      case '-1':
        return prev - 1;
      default:
        throw new Error();
    }
  };

  return atomWithReducer(0, reducer);
}

const countAtom = createCountAtom();
const anotherCountAtom = createCountAtom();

const Counter = () => {
  const [count, dispatch] = useAtom(countAtom);
  const [anotherCount, dispatchAnother] = useAtom(anotherCountAtom);
  return (
    <>
      <div>
        <span>count: {count}</span>
        <button type="button" onClick={() => dispatch('+1')}>
          increment
        </button>
      </div>
      <div>
        <span>another count: {anotherCount}</span>
        <button type="button" onClick={() => dispatchAnother('+1')}>
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
      <Counter />
      <h1>Second Provider</h1>
      <ScopeProvider atoms={[anotherCountAtom]}>
        <Counter />

        <h1>Third Provider</h1>
        <ScopeProvider atoms={[anotherCountAtom]}>
          <Counter />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

export default App;
