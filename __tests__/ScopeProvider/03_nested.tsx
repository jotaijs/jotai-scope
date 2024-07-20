import { render } from '@testing-library/react';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithReducer } from 'jotai/vanilla/utils';
import { clickButton, getTextContents } from '../utils';

import { ScopeProvider } from '../../src/index';

const baseAtom1 = atomWithReducer(0, (v) => v + 1);
const baseAtom2 = atomWithReducer(0, (v) => v + 1);
const baseAtom = atom(0);

const writeProxyAtom = atom('unused', (get, set) => {
  set(baseAtom, get(baseAtom) + 1);
  set(baseAtom1);
  set(baseAtom2);
});

function Counter({ counterClass }: { counterClass: string }) {
  const [base1, increaseBase1] = useAtom(baseAtom1);
  const [base2, increaseBase2] = useAtom(baseAtom2);
  const base = useAtomValue(baseAtom);
  const increaseAll = useSetAtom(writeProxyAtom);
  return (
    <>
      <div>
        base1: <span className={`${counterClass} base1`}>{base1}</span>
        <button
          className={`${counterClass} setBase1`}
          type="button"
          onClick={() => increaseBase1()}
        >
          increase
        </button>
      </div>
      <div>
        base2: <span className={`${counterClass} base2`}>{base2}</span>
        <button
          className={`${counterClass} setBase2`}
          type="button"
          onClick={() => increaseBase2()}
        >
          increase
        </button>
      </div>
      <div>
        base: <span className={`${counterClass} base`}>{base}</span>
      </div>
      <button
        className={`${counterClass} setAll`}
        type="button"
        onClick={() => increaseAll()}
      >
        increase all three atoms
      </button>
    </>
  );
}

function App() {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter counterClass="unscoped" />
      <h1>Layer 1: Scope base 1</h1>
      <p>base 2 and base should be globally shared</p>
      <ScopeProvider atoms={[baseAtom1]}>
        <Counter counterClass="layer1" />
        <h1>Layer 2: Scope base 2</h1>
        <p>
          base 1 should be shared between layer 1 and layer 2, base should be
          globally shared
        </p>
        <ScopeProvider atoms={[baseAtom2]}>
          <Counter counterClass="layer2" />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
}

describe('Counter', () => {
  /*
  baseA, baseB, baseC
  S1[baseA]: baseA1 baseB0 baseC0
  S2[baseB]: baseA1 baseB2 baseC0
  */
  test('nested primitive atoms are correctly scoped', () => {
    const { container } = render(<App />);
    const increaseUnscopedBase1 = '.unscoped.setBase1';
    const increaseUnscopedBase2 = '.unscoped.setBase2';
    const increaseAllUnscoped = '.unscoped.setAll';
    const increaseLayer1Base1 = '.layer1.setBase1';
    const increaseLayer1Base2 = '.layer1.setBase2';
    const increaseAllLayer1 = '.layer1.setAll';
    const increaseLayer2Base1 = '.layer2.setBase1';
    const increaseLayer2Base2 = '.layer2.setBase2';
    const increaseAllLayer2 = '.layer2.setAll';

    const atomValueSelectors = [
      '.unscoped.base1',
      '.unscoped.base2',
      '.unscoped.base',
      '.layer1.base1',
      '.layer1.base2',
      '.layer1.base',
      '.layer2.base1',
      '.layer2.base2',
      '.layer2.base',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '0',
      '0',
      '1',
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseAllUnscoped);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '2',
      '1',
      '0',
      '2',
      '1',
      '0',
      '0',
      '1',
    ]);

    clickButton(container, increaseLayer1Base1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '2',
      '1',
      '1',
      '2',
      '1',
      '1',
      '0',
      '1',
    ]);

    clickButton(container, increaseLayer1Base2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '3',
      '1',
      '1',
      '3',
      '1',
      '1',
      '0',
      '1',
    ]);

    clickButton(container, increaseAllLayer1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '2',
      '4',
      '2',
      '2',
      '0',
      '2',
    ]);

    clickButton(container, increaseLayer2Base1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '3',
      '4',
      '2',
      '3',
      '0',
      '2',
    ]);

    clickButton(container, increaseLayer2Base2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '2',
      '3',
      '4',
      '2',
      '3',
      '1',
      '2',
    ]);

    clickButton(container, increaseAllLayer2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '4',
      '3',
      '4',
      '4',
      '3',
      '4',
      '2',
      '3',
    ]);
  });
});
