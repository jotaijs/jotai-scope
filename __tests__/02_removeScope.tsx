import { render } from '@testing-library/react';

import { atom, useAtom, useAtomValue } from 'jotai';
import { atomWithReducer } from 'jotai/vanilla/utils';
import { PropsWithChildren } from 'react';
import { ScopeProvider } from '../src/index';
import { clickButton, getTextContents } from './utils';

const baseAtom1 = atomWithReducer(0, (v) => v + 1);
const baseAtom2 = atomWithReducer(0, (v) => v + 1);
const shouldHaveScopeAtom = atom(true);

const Counter = ({ counterClass }: { counterClass: string }) => {
  const [base1, increaseBase1] = useAtom(baseAtom1);
  const [base2, increaseBase2] = useAtom(baseAtom2);
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
    </>
  );
};

const Wrapper = ({ children }: PropsWithChildren) => {
  const shouldHaveScope = useAtomValue(shouldHaveScopeAtom);
  return shouldHaveScope ? (
    <ScopeProvider atoms={[baseAtom2]}>{children}</ScopeProvider>
  ) : (
    children
  );
};

const ScopeButton = () => {
  const [shouldHaveScope, setShouldHaveScope] = useAtom(shouldHaveScopeAtom);
  return (
    <button
      id="toggleScope"
      type="button"
      onClick={() => setShouldHaveScope((prev) => !prev)}
    >
      {shouldHaveScope ? 'Disable' : 'Enable'} Scope
    </button>
  );
};

const App = () => {
  return (
    <div>
      <h1>Unscoped</h1>
      <Counter counterClass="unscoped" />
      <h1>Scoped Provider</h1>
      <Wrapper>
        <Counter counterClass="scoped" />
      </Wrapper>
      <ScopeButton />
    </div>
  );
};

describe('Counter', () => {
  test('atom get correct value when ScopeProvider is added/removed', () => {
    const { container } = render(<App />);
    const increaseUnscopedBase1 = '.unscoped.setBase1';
    const increaseUnscopedBase2 = '.unscoped.setBase2';
    const increaseScopedBase1 = '.scoped.setBase1';
    const increaseScopedBase2 = '.scoped.setBase2';
    const toggleScope = '#toggleScope';

    const atomValueSelectors = [
      '.unscoped.base1',
      '.unscoped.base2',
      '.scoped.base1',
      '.scoped.base2',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '1',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
      '0',
    ]);

    clickButton(container, increaseScopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '0',
    ]);

    clickButton(container, increaseScopedBase2);
    clickButton(container, increaseScopedBase2);
    clickButton(container, increaseScopedBase2);

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '3',
    ]);

    clickButton(container, toggleScope);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2',
      '1',
      '2',
      '1',
    ]);

    clickButton(container, increaseUnscopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3',
      '1',
      '3',
      '1',
    ]);

    clickButton(container, increaseUnscopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3',
      '2',
      '3',
      '2',
    ]);

    clickButton(container, increaseScopedBase1);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '2',
      '4',
      '2',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '3',
    ]);

    clickButton(container, toggleScope);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '0',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '1',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '2',
    ]);

    clickButton(container, increaseScopedBase2);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4',
      '3',
      '4',
      '3',
    ]);
  });
});
