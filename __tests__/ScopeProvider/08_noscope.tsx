import { render } from '@testing-library/react';
import { atom, useAtomValue } from 'jotai';
import { getTextContents } from '../utils';
import { ScopeProvider } from '../../src/index';

let i = 1;
const AtomA = atom(() => i++);
const AtomB = atom((get) => get(AtomA));

const Child = ({ level }: { level?: string }) => {
  const valueA = useAtomValue(AtomA);
  const valueB = useAtomValue(AtomB);
  return (
    <div className={level}>
      Atom A is not scoped so its value should always be 1
      <div className="valueA">{valueA}</div>
      Atom B is scoped, so its will use the implicitly scoped Atom A
      <div className="valueB">{valueB}</div>
    </div>
  );
};

/*
  AtomA
  S0[]: AtomA0
  S1[AtomA!]: AtomA!
  S2[]: AtomA!
*/
const App = () => {
  return (
    <div className="App">
      <Child level="level0" />
      <ScopeProvider atoms={[AtomB]} noScope={[AtomA]} debugName="level1">
        <Child level="level1" />
        <ScopeProvider atoms={[]} debugName="level2">
          <Child level="level2" />
        </ScopeProvider>
      </ScopeProvider>
    </div>
  );
};

const { container } = render(<App />);

describe('No Scope', () => {
  test('AtomA is not scoped so its value should always be 1', () => {
    const selectors = [
      '.level0 .valueA',
      '.level0 .valueB',
      '.level1 .valueA',
      '.level1 .valueB',
      '.level2 .valueA',
      '.level2 .valueB',
    ];

    expect(getTextContents(container, selectors)).toEqual([
      '1', // level0 valueA
      '1', // level0 valueB
      '1', // level1 valueA
      '2', // level1 valueB
      '1', // level1 valueA
      '2', // level1 valueB
    ]);
  });
});
