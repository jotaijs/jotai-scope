import { useAtom } from "jotai";
import { atomWithReducer } from "jotai/utils";
import { ScopeProvider } from "jotai-scope";

function createCountAtom() {
  type State = number;
  type Action = "+1" | "-1";

  const reducer = (prev: State, action: Action) => {
    switch (action) {
      case "+1":
        return prev + 1;
      case "-1":
        return prev - 1;
    }
  };

  return atomWithReducer(0, reducer);
}

const countAtom = createCountAtom();
const anotherCountAtom = createCountAtom();

const Counter = () => {
  const [count, dispath] = useAtom(countAtom);
  const [anotherCount, dispathAnother] = useAtom(anotherCountAtom);
  return (
    <>
      <div>
        <span>count: {count}</span>
        <button type="button" onClick={() => dispath("+1")}>
          increment
        </button>
      </div>
      <div>
        <span>another count: {anotherCount}</span>
        <button type="button" onClick={() => dispathAnother("+1")}>
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

        <h1>Thrid Provider</h1>
        <ScopeProvider atoms={[anotherCountAtom]}>
          <Counter />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

export default App;
