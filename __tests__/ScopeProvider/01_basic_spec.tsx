import { render } from '@testing-library/react';
import {
  useAtom,
  useSetAtom,
  useAtomValue,
  atom,
  WritableAtom,
  SetStateAction,
} from 'jotai';
import { atomWithReducer } from 'jotai/vanilla/utils';
import { ScopeProvider } from '../../src/index';
import { clickButton, getTextContents } from '../utils';

describe('Counter', () => {
  test('ScopeProvider provides isolation for scoped primitive atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const [base, increaseBase] = useAtom(baseAtom);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{base}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => increaseBase()}
          >
            increase
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="unscoped" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter counterClass="scoped" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.unscoped.setBase';
    const increaseScopedBase = '.scoped.setBase';

    const atomValueSelectors = ['.unscoped.base', '.scoped.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1']);
  });

  test('unscoped derived can read and write to scoped primitive atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    const derivedAtom = atom(
      (get) => get(baseAtom),
      (get, set) => {
        set(baseAtom, get(baseAtom) + 1);
      },
    );

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const [derived, increaseFromDerived] = useAtom(derivedAtom);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{derived}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={increaseFromDerived}
          >
            increase
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="unscoped" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter counterClass="scoped" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.unscoped.setBase';
    const increaseScopedBase = '.scoped.setBase';

    const atomValueSelectors = ['.unscoped.base', '.scoped.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1']);
  });

  test('unscoped derived can read both scoped and unscoped atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    const notScopedAtom = atom(0);
    const derivedAtom = atom((get) => ({
      base: get(baseAtom),
      notScoped: get(notScopedAtom),
    }));

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const increaseBase = useSetAtom(baseAtom);
      const derived = useAtomValue(derivedAtom);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{derived.base}</span>
          not scoped:{' '}
          <span className={`${counterClass} notScoped`}>
            {derived.notScoped}
          </span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => increaseBase()}
          >
            increase
          </button>
        </div>
      );
    };

    const IncreaseUnscoped = () => {
      const setNotScoped = useSetAtom(notScopedAtom);
      return (
        <button
          type="button"
          onClick={() => setNotScoped((c) => c + 1)}
          className="increaseNotScoped"
        >
          increase unscoped
        </button>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="unscoped" />
          <IncreaseUnscoped />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter counterClass="scoped" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.unscoped.setBase';
    const increaseScopedBase = '.scoped.setBase';
    const increaseNotScoped = '.increaseNotScoped';

    const atomValueSelectors = [
      '.unscoped.base',
      '.scoped.base',
      '.scoped.notScoped',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
    ]);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '0',
    ]);

    clickButton(container, increaseNotScoped);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
    ]);
  });

  test('dependencies of scoped derived are implicitly scoped', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    const derivedAtom = atom((get) => get(baseAtom));

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const increaseBase = useSetAtom(baseAtom);
      const derived = useAtomValue(derivedAtom);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{derived}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => increaseBase()}
          >
            increase
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="unscoped" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[derivedAtom]}>
            <Counter counterClass="scoped" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.unscoped.setBase';
    const increaseScopedBase = '.scoped.setBase';

    const atomValueSelectors = ['.unscoped.base', '.scoped.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1']);
  });

  test('scoped derived atoms can share implicitly scoped dependencies', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    const derivedAtom1 = atom((get) => get(baseAtom));
    const derivedAtom2 = atom((get) => get(baseAtom));

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const increaseBase = useSetAtom(baseAtom);
      const derived = useAtomValue(derivedAtom1);
      const derived2 = useAtomValue(derivedAtom2);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{derived}</span>
          base2: <span className={`${counterClass} base2`}>{derived2}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => increaseBase()}
          >
            increase
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="unscoped" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[derivedAtom1, derivedAtom2]}>
            <Counter counterClass="scoped" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.unscoped.setBase';
    const increaseScopedBase = '.scoped.setBase';

    const atomValueSelectors = [
      '.unscoped.base',
      '.scoped.base',
      '.scoped.base2',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
    ]);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
    ]);
  });

  test('nested scopes provide isolation for primitive atoms at every level', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const [base, increaseBase] = useAtom(baseAtom);
      return (
        <div>
          base: <span className={`${counterClass} base`}>{base}</span>
          <button
            className={`${counterClass} setBase`}
            type="button"
            onClick={() => increaseBase()}
          >
            increase
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter counterClass="level1" />
            <ScopeProvider atoms={[baseAtom]}>
              <Counter counterClass="level2" />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.level0.setBase';
    const increaseScopedBase = '.level1.setBase';
    const increaseDoubleScopedBase = '.level2.setBase';

    const atomValueSelectors = ['.level0.base', '.level1.base', '.level2.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0',
      '0',
      '0',
    ]);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '0',
      '0',
    ]);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '0',
    ]);

    clickButton(container, increaseDoubleScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1',
      '1',
      '1',
    ]);
  });

  /*
    FIXME: The remaining tests are failing because of an infinite loop on unstable_is
  */
  test.skip('unscoped derived atoms in nested scoped can read and write to scoped primitive atoms at every level', () => {
    const base0Atom = atom(0);
    const base1Atom = atom(0);
    const base2Atom = atom(0);
    const derivedAtom = atom(
      (get) => ({
        base0: get(base0Atom),
        base1: get(base1Atom),
        base2: get(base2Atom),
      }),
      (get, set) => {
        set(base0Atom, get(base0Atom) + 1);
        set(base1Atom, get(base1Atom) + 1);
        set(base2Atom, get(base2Atom) + 1);
      },
    );

    const Counter = ({
      counterClass,
      baseAtom,
    }: {
      counterClass: string;
      baseAtom: WritableAtom<number, [SetStateAction<number>], void>;
    }) => {
      const setBase = useSetAtom(baseAtom);
      const [{ base0, base1, base2 }, increaseAll] = useAtom(derivedAtom);
      return (
        <div>
          base0: <span className={`${counterClass} base0`}>{base0}</span>
          level1: <span className={`${counterClass} base1`}>{base1}</span>
          level2: <span className={`${counterClass} base2`}>{base2}</span>
          <button
            className={`${counterClass} increaseBase`}
            type="button"
            onClick={() => setBase((c) => c + 1)}
          >
            increase base
          </button>
          <button
            className={`${counterClass} increaseAll`}
            type="button"
            onClick={increaseAll}
          >
            increase all
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter counterClass="level0" baseAtom={base0Atom} />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[base1Atom]}>
            <Counter counterClass="level1" baseAtom={base1Atom} />
            <ScopeProvider atoms={[base2Atom]}>
              <Counter counterClass="level2" baseAtom={base2Atom} />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseLevel0Base = '.level0.increaseBase';
    const increaseLevel1Base = '.level1.increaseBase';
    const increaseLevel2Base = '.level2.increaseBase';
    const increaseLevel0All = '.level0.increaseAll';
    const increaseLevel1All = '.level1.increaseAll';
    const increaseLevel2All = '.level2.increaseAll';

    const atomValueSelectors = [
      '.level0.base0',
      '.level0.base1',
      '.level0.base2',
      '.level1.base0',
      '.level1.base1',
      '.level1.base2',
      '.level2.base0',
      '.level2.base1',
      '.level2.base2',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 base0
      '0', // level0 base1
      '0', // level0 base2
      '0', // level1 base0
      '0', // level1 base1
      '0', // level1 base2
      '0', // level2 base0
      '0', // level2 base1
      '0', // level2 base2
    ]);

    clickButton(container, increaseLevel0Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base0
      '0', // level0 base1
      '0', // level0 base2
      '1', // level1 base0
      '0', // level1 base1
      '0', // level1 base2
      '1', // level2 base0
      '0', // level2 base1
      '0', // level2 base2
    ]);

    clickButton(container, increaseLevel1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base0
      '0', // level0 base1
      '0', // level0 base2
      '1', // level1 base0
      '1', // level1 base1
      '0', // level1 base2
      '1', // level2 base0
      '1', // level2 base1
      '0', // level2 base2
    ]);

    clickButton(container, increaseLevel2Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base0
      '0', // level0 base1
      '0', // level0 base2
      '1', // level1 base0
      '1', // level1 base1
      '0', // level1 base2
      '1', // level2 base0
      '1', // level2 base1
      '1', // level2 base2
    ]);

    clickButton(container, increaseLevel0All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 base0
      '1', // level0 base1
      '1', // level0 base2
      '2', // level1 base0
      '1', // level1 base1
      '0', // level1 base2
      '2', // level2 base0
      '1', // level2 base1
      '1', // level2 base2
    ]);

    clickButton(container, increaseLevel1All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3', // level0 base0
      '1', // level0 base1
      '1', // level0 base2
      '3', // level1 base0
      '2', // level1 base1
      '1', // level1 base2
      '3', // level2 base0
      '2', // level2 base1
      '1', // level2 base2
    ]);

    clickButton(container, increaseLevel2All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4', // level0 base0
      '1', // level0 base1
      '1', // level0 base2
      '4', // level1 base0
      '3', // level1 base1
      '1', // level1 base2
      '4', // level2 base0
      '3', // level2 base1
      '2', // level2 base2
    ]);
  });

  test.skip('inherited scoped derived atoms can read and write to scoped primitive atoms at every nested level', () => {
    const base1Atom = atom(0);
    base1Atom.debugLabel = 'base1Atom';
    const base2Atom = atom(0);
    base2Atom.debugLabel = 'base2Atom';
    const derivedAtom = atom(
      (get) => ({
        base1: get(base1Atom),
        base2: get(base2Atom),
      }),
      (get, set) => {
        set(base1Atom, get(base1Atom) + 1);
        set(base2Atom, get(base2Atom) + 1);
      },
    );
    derivedAtom.debugLabel = 'derivedAtom';

    const Counter = ({ counterClass }: { counterClass: string }) => {
      const [{ base1, base2 }, increaseAll] = useAtom(derivedAtom);
      return (
        <div>
          level1: <span className={`${counterClass} base1`}>{base1}</span>
          level2: <span className={`${counterClass} base2`}>{base2}</span>
          <button
            className={`${counterClass} increaseAll`}
            type="button"
            onClick={increaseAll}
          >
            increase all
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <h1>Scoped Provider</h1>
          <ScopeProvider className="level1" atoms={[derivedAtom, base2Atom]}>
            <Counter counterClass="level1" />
            <ScopeProvider className="level2" atoms={[base2Atom]}>
              <Counter counterClass="level2" />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseLevel1All = '.level1.increaseAll';
    const increaseLevel2All = '.level2.increaseAll';

    const atomValueSelectors = [
      '.level1.base1',
      '.level1.base2',
      '.level2.base1',
      '.level2.base2',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level1 base1
      '0', // level1 base2
      '0', // level2 base1
      '0', // level2 base2
    ]);

    clickButton(container, increaseLevel1All);
    expect(getTextContents(container, atomValueSelectors).join('')).toEqual(
      '1110', // level1 base1, level1 base2, level2 base1, level2 base2
    );

    clickButton(container, increaseLevel2All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level1 base1
      '1', // level1 base2
      '2', // level2 base1
      '1', // level2 base2
    ]);
  });
});
