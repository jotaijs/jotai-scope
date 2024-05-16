import { render } from '@testing-library/react';
import { atom, useAtom } from 'jotai';
import { clickButton, getTextContents } from '../utils';
import { ScopeProvider } from '../../src/index';

const baseAtom = atom(0);
const derivedAtom1 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1);
  },
);

const derivedAtom2 = atom(
  (get) => get(baseAtom),
  (get, set) => {
    set(baseAtom, get(baseAtom) + 1);
  },
);

function Counter({ counterClass }: { counterClass: string }) {
  const [base, setBase] = useAtom(baseAtom);
  const [derived1, setDerived1] = useAtom(derivedAtom1);
  const [derived2, setDerived2] = useAtom(derivedAtom2);
  return (
    <>
      <div>
        base: <span className={`${counterClass} base`}>{base}</span>
        <button
          className={`${counterClass} setBase`}
          type="button"
          onClick={() => setBase((c) => c + 1)}
        >
          increment
        </button>
      </div>
      <div>
        derived1: <span className={`${counterClass} derived1`}>{derived1}</span>
        <button
          className={`${counterClass} setDerived1`}
          type="button"
          onClick={() => setDerived1()}
        >
          increment
        </button>
      </div>
      <div>
        derived2: <span className={`${counterClass} derived2`}>{derived2}</span>
        <button
          className={`${counterClass} setDerived2`}
          type="button"
          onClick={() => setDerived2()}
        >
          increment
        </button>
      </div>
    </>
  );
}

function App() {
  return (
    <div>
      <h1>Only base is scoped</h1>
      <p>derived1 and derived2 should also be scoped</p>
      <ScopeProvider atoms={[baseAtom]}>
        <Counter counterClass="case1" />
      </ScopeProvider>
      <h1>Both derived1 an derived2 are scoped</h1>
      <p>base should be global, derived1 and derived2 are shared</p>
      <ScopeProvider atoms={[derivedAtom1, derivedAtom2]}>
        <Counter counterClass="case2" />
      </ScopeProvider>
      <h1>Layer1: Only derived1 is scoped</h1>
      <p>base and derived2 should be global</p>
      <ScopeProvider atoms={[derivedAtom1]}>
        <Counter counterClass="layer1" />
        <h2>Layer2: Base and derived2 are scoped</h2>
        <p>
          derived1 should use layer2&apos;s atom, base and derived2 are layer 2
          scoped
        </p>
        <ScopeProvider atoms={[baseAtom, derivedAtom2]}>
          <Counter counterClass="layer2" />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
}

describe('Counter', () => {
  test("parent scope's derived atom is prior to nested scope's scoped base", () => {
    const increaseCase1Base = '.case1.setBase';
    const increaseCase1Derived1 = '.case1.setDerived1';
    const increaseCase1Derived2 = '.case1.setDerived2';
    const increaseCase2Base = '.case2.setBase';
    const increaseCase2Derived1 = '.case2.setDerived1';
    const increaseCase2Derived2 = '.case2.setDerived2';
    const increaseLayer1Base = '.layer1.setBase';
    const increaseLayer1Derived1 = '.layer1.setDerived1';
    const increaseLayer1Derived2 = '.layer1.setDerived2';
    const increaseLayer2Base = '.layer2.setBase';
    const increaseLayer2Derived1 = '.layer2.setDerived1';
    const increaseLayer2Derived2 = '.layer2.setDerived2';

    const atomValueSelectors = [
      '.case1.base',
      '.case1.derived1',
      '.case1.derived2',
      '.case2.base',
      '.case2.derived1',
      '.case2.derived2',
      '.layer1.base',
      '.layer1.derived1',
      '.layer1.derived2',
      '.layer2.base',
      '.layer2.derived1',
      '.layer2.derived2',
    ];

    const { container } = render(<App />);

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '0', // .case1.base
      '0', // .case1.derived1
      '0', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '0', // .case2.base
      '0', // .case2.derived1
      '0', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '0', // .layer1.base
      '0', // .layer1.derived1
      '0', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '1', // .case1.base
      '1', // .case1.derived1
      '1', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '0', // .case2.base
      '0', // .case2.derived1
      '0', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '0', // .layer1.base
      '0', // .layer1.derived1
      '0', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase1Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '2', // .case1.base
      '2', // .case1.derived1
      '2', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '0', // .case2.base
      '0', // .case2.derived1
      '0', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '0', // .layer1.base
      '0', // .layer1.derived1
      '0', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase1Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '0', // .case2.base
      '0', // .case2.derived1
      '0', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '0', // .layer1.base
      '0', // .layer1.derived1
      '0', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase2Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '1', // .case2.base
      '0', // .case2.derived1
      '0', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '1', // .layer1.base
      '0', // .layer1.derived1
      '1', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase2Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '1', // .case2.base
      '1', // .case2.derived1
      '1', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '1', // .layer1.base
      '0', // .layer1.derived1
      '1', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseCase2Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '1', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '1', // .layer1.base
      '0', // .layer1.derived1
      '1', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '2', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '2', // .layer1.base
      '0', // .layer1.derived1
      '2', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer1Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '2', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '2', // .layer1.base
      '1', // .layer1.derived1
      '2', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer1Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '3', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '3', // .layer1.base
      '1', // .layer1.derived1
      '3', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '0', // .layer2.base
      '0', // .layer2.derived1
      '0', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer2Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '3', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '3', // .layer1.base
      '1', // .layer1.derived1
      '3', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '1', // .layer2.base
      '1', // .layer2.derived1
      '1', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer2Derived1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '3', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '3', // .layer1.base
      '2', // .layer1.derived1
      '3', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '2', // .layer2.base
      '2', // .layer2.derived1
      '2', // .layer2.derived2
    ]);

    clickButton(container, increaseLayer2Derived2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      // case 1: baseAtom scoped
      '3', // .case1.base
      '3', // .case1.derived1
      '3', // .case1.derived2

      // case 2: derivedAtom1 and derivedAtom2 scoped
      '3', // .case2.base
      '2', // .case2.derived1
      '2', // .case2.derived2

      // layer1: derivedAtom1 scoped
      '3', // .layer1.base
      '2', // .layer1.derived1
      '3', // .layer1.derived2

      // layer2: baseAtom and derivedAtom2 scoped (nested in layer1)
      '3', // .layer2.base
      '3', // .layer2.derived1
      '3', // .layer2.derived2
    ]);
  });
});
