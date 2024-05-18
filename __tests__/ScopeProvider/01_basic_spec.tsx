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
  /*
    base
    S0[base]: base0
    S1[base]: base1
  */
  test('ScopeProvider provides isolation for scoped primitive atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    baseAtom.debugLabel = 'base';
    const Counter = ({ level }: { level: string }) => {
      const [base, increaseBase] = useAtom(baseAtom);
      return (
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button
            className={`${level} setBase`}
            type="button"
            onClick={increaseBase}
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
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]} debugName="level1">
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.level0.setBase';
    const increaseScopedBase = '.level1.setBase';
    const atomValueSelectors = ['.level0.base', '.level1.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1']);
  });

  /*
    base, derived(base)
    S0[base]: derived0(base0)
    S1[base]: derived0(base1)
  */
  test('unscoped derived can read and write to scoped primitive atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    const derivedAtom = atom(
      (get) => get(baseAtom),
      (get, set) => set(baseAtom, get(baseAtom) + 1),
    );

    const Counter = ({ level }: { level: string }) => {
      const [derived, increaseFromDerived] = useAtom(derivedAtom);
      return (
        <div>
          base:<span className={`${level} base`}>{derived}</span>
          <button
            className={`${level} setBase`}
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
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.level0.setBase';
    const increaseScopedBase = '.level1.setBase';
    const atomValueSelectors = ['.level0.base', '.level1.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '1']);
  });

  /*
    base, notScoped, derived(base + notScoped)
    S0[base]: derived0(base0 + notScoped0)
    S1[base]: derived0(base1 + notScoped0)
  */
  test('unscoped derived can read both scoped and unscoped atoms', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    baseAtom.debugLabel = 'base';
    const notScopedAtom = atomWithReducer(0, (v) => v + 1);
    notScopedAtom.debugLabel = 'notScoped';
    const derivedAtom = atom((get) => ({
      base: get(baseAtom),
      notScoped: get(notScopedAtom),
    }));
    derivedAtom.debugLabel = 'derived';

    const Counter = ({ level }: { level: string }) => {
      const increaseBase = useSetAtom(baseAtom);
      const derived = useAtomValue(derivedAtom);
      return (
        <div>
          base:<span className={`${level} base`}>{derived.base}</span>
          not scoped:
          <span className={`${level} notScoped`}>{derived.notScoped}</span>
          <button
            className={`${level} setBase`}
            type="button"
            onClick={increaseBase}
          >
            increase
          </button>
        </div>
      );
    };

    const IncreaseUnscoped = () => {
      const increaseNotScoped = useSetAtom(notScopedAtom);
      return (
        <button
          type="button"
          onClick={increaseNotScoped}
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
          <Counter level="level0" />
          <IncreaseUnscoped />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]} debugName="level1">
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.level0.setBase';
    const increaseScopedBase = '.level1.setBase';
    const increaseNotScoped = '.increaseNotScoped';
    const atomValueSelectors = [
      '.level0.base',
      '.level1.base',
      '.level1.notScoped',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 base
      '0', // level1 base
      '0', // level1 notScoped
    ]);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '0', // level1 base
      '0', // level1 notScoped
    ]);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
      '0', // level1 notScoped
    ]);

    clickButton(container, increaseNotScoped);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 base
      '1', // level1 base
      '1', // level1 notScoped
    ]);
  });

  /*
    base, derived(base),
    S0[derived]: derived0(base0)
    S1[derived]: derived1(base1)
  */
  test('dependencies of scoped derived are implicitly scoped', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    baseAtom.debugLabel = 'base';

    const derivedAtom = atom(
      (get) => get(baseAtom),
      (_get, set) => set(baseAtom),
    );
    derivedAtom.debugLabel = 'derived';

    const Counter = ({ level }: { level: string }) => {
      const increaseBase = useSetAtom(baseAtom);
      const [derived, setDerived] = useAtom(derivedAtom);
      return (
        <div>
          base:<span className={`${level} base`}>{derived}</span>
          <button
            className={`${level} setBase`}
            type="button"
            onClick={increaseBase}
          >
            increase base
          </button>
          <button
            className={`${level} setDerived`}
            type="button"
            onClick={setDerived}
          >
            increase derived
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[derivedAtom]} debugName="level1">
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseUnscopedBase = '.level0.setBase';
    const increaseScopedBase = '.level1.setBase';
    const increaseScopedDerived = '.level1.setDerived';
    const atomValueSelectors = ['.level0.base', '.level1.base'];

    expect(getTextContents(container, atomValueSelectors)).toEqual(['0', '0']);

    clickButton(container, increaseUnscopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['1', '0']);

    clickButton(container, increaseScopedBase);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['2', '0']);

    clickButton(container, increaseScopedDerived);
    expect(getTextContents(container, atomValueSelectors)).toEqual(['2', '1']);
  });

  /*
    base, derivedA(base), derivemB(base)
    S0[derivedA, derivedB]: derivedA0(base0), derivedB0(base0)
    S1[derivedA, derivedB]: derivedA1(base1), derivedB1(base1)
  */
  test('scoped derived atoms can share implicitly scoped dependencies', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);
    baseAtom.debugLabel = 'base';
    const derivedAtomA = atom(
      (get) => get(baseAtom),
      (_get, set) => set(baseAtom),
    );
    derivedAtomA.debugLabel = 'derivedAtomA';
    const derivedAtomB = atom(
      (get) => get(baseAtom),
      (_get, set) => set(baseAtom),
    );
    derivedAtomB.debugLabel = 'derivedAtomB';

    const Counter = ({ level }: { level: string }) => {
      const setBase = useSetAtom(baseAtom);
      const [derivedA, setDerivedA] = useAtom(derivedAtomA);
      const [derivedB, setDerivedB] = useAtom(derivedAtomB);
      return (
        <div>
          base:<span className={`${level} base`}>{derivedA}</span>
          derivedA:
          <span className={`${level} derivedA`}>{derivedA}</span>
          derivedB:
          <span className={`${level} derivedB`}>{derivedB}</span>
          <button
            className={`${level} setBase`}
            type="button"
            onClick={setBase}
          >
            set base
          </button>
          <button
            className={`${level} setDerivedA`}
            type="button"
            onClick={setDerivedA}
          >
            set derivedA
          </button>
          <button
            className={`${level} setDerivedB`}
            type="button"
            onClick={setDerivedB}
          >
            set derivedB
          </button>
        </div>
      );
    };

    const App = () => {
      return (
        <div>
          <h1>Unscoped</h1>
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[derivedAtomA, derivedAtomB]}>
            <Counter level="level1" />
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseLevel0Base = '.level0.setBase';
    const increaseLevel1Base = '.level1.setBase';
    const increaseLevel1DerivedA = '.level1.setDerivedA';
    const increaseLevel1DerivedB = '.level1.setDerivedB';
    const atomValueSelectors = [
      '.level0.derivedA',
      '.level1.derivedA',
      '.level1.derivedB',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 derivedA
      '0', // level1 derivedA
      '0', // level1 derivedB
    ]);

    clickButton(container, increaseLevel0Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 derivedA
      '0', // level1 derivedA
      '0', // level1 derivedB
    ]);

    clickButton(container, increaseLevel1Base);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 derivedA
      '0', // level1 derivedA
      '0', // level1 derivedB
    ]);

    clickButton(container, increaseLevel1DerivedA);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 derivedA
      '1', // level1 derivedA
      '1', // level1 derivedB
    ]);

    clickButton(container, increaseLevel1DerivedB);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 derivedA
      '2', // level1 derivedA
      '2', // level1 derivedB
    ]);
  });

  /*
    base, derivedA(base), derivedB(base),
    S0[base]: base0
    S1[base]: base1
    S2[base]: base2
    S3[base]: base3
  */
  test('nested scopes provide isolation for primitive atoms at every level', () => {
    const baseAtom = atomWithReducer(0, (v) => v + 1);

    const Counter = ({ level }: { level: string }) => {
      const [base, increaseBase] = useAtom(baseAtom);
      return (
        <div>
          base:<span className={`${level} base`}>{base}</span>
          <button
            className={`${level} setBase`}
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
          <Counter level="level0" />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseAtom]}>
            <Counter level="level1" />
            <ScopeProvider atoms={[baseAtom]}>
              <Counter level="level2" />
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
    baseA, baseB, baseC 
    S0[baseA]: baseA0
    S1[baseB]: baseB1
    S2[baseC]: baseC2
  */
  test('unscoped derived atoms in nested scoped can read and write to scoped primitive atoms at every level', () => {
    const baseAAtom = atom(0);
    baseAAtom.debugLabel = 'baseA';
    const baseBAtom = atom(0);
    baseBAtom.debugLabel = 'baseB';
    const baseCAtom = atom(0);
    baseCAtom.debugLabel = 'baseC';
    const derivedAtom = atom(
      (get) => ({
        baseA: get(baseAAtom),
        baseB: get(baseBAtom),
        baseC: get(baseCAtom),
      }),
      (get, set) => {
        set(baseAAtom, get(baseAAtom) + 1);
        set(baseBAtom, get(baseBAtom) + 1);
        set(baseCAtom, get(baseCAtom) + 1);
      },
    );
    derivedAtom.debugLabel = 'derived';

    const Counter = ({
      level,
      baseAtom,
    }: {
      level: string;
      baseAtom: WritableAtom<number, [SetStateAction<number>], void>;
    }) => {
      const setBase = useSetAtom(baseAtom);
      const [{ baseA, baseB, baseC }, increaseAll] = useAtom(derivedAtom);
      return (
        <div>
          level0:<span className={`${level} baseA`}>{baseA}</span>
          level1:<span className={`${level} baseB`}>{baseB}</span>
          level2:<span className={`${level} baseC`}>{baseC}</span>
          <button
            className={`${level} increaseBase`}
            type="button"
            onClick={() => {
              setBase((c) => c + 1);
            }}
          >
            increase base
          </button>
          <button
            className={`${level} increaseAll`}
            type="button"
            onClick={() => {
              increaseAll();
            }}
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
          <Counter level="level0" baseAtom={baseAAtom} />
          <h1>Scoped Provider</h1>
          <ScopeProvider atoms={[baseBAtom]}>
            <Counter level="level1" baseAtom={baseBAtom} />
            <ScopeProvider atoms={[baseCAtom]}>
              <Counter level="level2" baseAtom={baseCAtom} />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);
    const increaseLevel0BaseA = '.level0.increaseBase';
    const increaseLevel1BaseB = '.level1.increaseBase';
    const increaseLevel2BaseC = '.level2.increaseBase';
    const increaseLevel0All = '.level0.increaseAll';
    const increaseLevel1All = '.level1.increaseAll';
    const increaseLevel2All = '.level2.increaseAll';
    const atomValueSelectors = [
      '.level0.baseA',
      '.level0.baseB',
      '.level0.baseC',
      '.level1.baseA',
      '.level1.baseB',
      '.level1.baseC',
      '.level2.baseA',
      '.level2.baseB',
      '.level2.baseC',
    ];

    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level0 baseA
      '0', // level0 baseB
      '0', // level0 baseC
      '0', // level1 baseA
      '0', // level1 baseB
      '0', // level1 baseC
      '0', // level2 baseA
      '0', // level2 baseB
      '0', // level2 baseC
    ]);

    clickButton(container, increaseLevel0BaseA);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 baseA
      '0', // level0 baseB
      '0', // level0 baseC
      '1', // level1 baseA
      '0', // level1 baseB
      '0', // level1 baseC
      '1', // level2 baseA
      '0', // level2 baseB
      '0', // level2 baseC
    ]);

    clickButton(container, increaseLevel1BaseB);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 baseA
      '0', // level0 baseB
      '0', // level0 baseC
      '1', // level1 baseA
      '1', // level1 baseB
      '0', // level1 baseC
      '1', // level2 baseA
      '1', // level2 baseB
      '0', // level2 baseC
    ]);

    clickButton(container, increaseLevel2BaseC);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level0 baseA
      '0', // level0 baseB
      '0', // level0 baseC
      '1', // level1 baseA
      '1', // level1 baseB
      '0', // level1 baseC
      '1', // level2 baseA
      '1', // level2 baseB
      '1', // level2 baseC
    ]);

    clickButton(container, increaseLevel0All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level0 baseA
      '1', // level0 baseB
      '1', // level0 baseC
      '2', // level1 baseA
      '1', // level1 baseB
      '1', // level1 baseC
      '2', // level2 baseA
      '1', // level2 baseB
      '1', // level2 baseC
    ]);

    clickButton(container, increaseLevel1All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '3', // level0 baseA
      '1', // level0 baseB
      '2', // level0 baseC
      '3', // level1 baseA
      '2', // level1 baseB
      '2', // level1 baseC
      '3', // level2 baseA
      '2', // level2 baseB
      '1', // level2 baseC
    ]);

    clickButton(container, increaseLevel2All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '4', // level0 baseA
      '1', // level0 baseB
      '2', // level0 baseC
      '4', // level1 baseA
      '3', // level1 baseB
      '2', // level1 baseC
      '4', // level2 baseA
      '3', // level2 baseB
      '2', // level2 baseC
    ]);
  });

  /*
    baseA, baseB, derived(baseA + baseB)
    S1[baseB, derived]: derived1(baseA1 + baseB1)
    S2[baseB]: derived1(baseA1 + baseB2)
  */
  test('inherited scoped derived atoms can read and write to scoped primitive atoms at every nested level', () => {
    const baseAAtom = atomWithReducer(0, (v) => v + 1);
    baseAAtom.debugLabel = 'baseA';

    const baseBAtom = atomWithReducer(0, (v) => v + 1);
    baseBAtom.debugLabel = 'baseB';

    const derivedAtom = atom(
      (get) => ({
        baseA: get(baseAAtom),
        baseB: get(baseBAtom),
      }),
      (_get, set) => {
        set(baseAAtom);
        set(baseBAtom);
      },
    );
    derivedAtom.debugLabel = 'derived';

    const Counter = ({ level }: { level: string }) => {
      const [{ baseA, baseB }, increaseAll] = useAtom(derivedAtom);
      return (
        <div>
          baseA:<span className={`${level} baseA`}>{baseA}</span>
          baseB:<span className={`${level} baseB`}>{baseB}</span>
          <button
            className={`${level} increaseAll`}
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
          <ScopeProvider atoms={[baseBAtom, derivedAtom]} debugName="level1">
            <Counter level="level1" />
            <ScopeProvider atoms={[baseBAtom]} debugName="level2">
              <Counter level="level2" />
            </ScopeProvider>
          </ScopeProvider>
        </div>
      );
    };
    const { container } = render(<App />);

    const increaseLevel1All = '.level1.increaseAll';
    const increaseLevel2All = '.level2.increaseAll';
    const atomValueSelectors = [
      '.level1.baseA',
      '.level1.baseB',
      '.level2.baseA',
      '.level2.baseB',
    ];

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '0', // level1 baseA1
      '0', // level1 baseB1
      '0', // level2 baseA1
      '0', // level2 baseB2
    ]);

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    clickButton(container, increaseLevel1All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '1', // level1 baseA1
      '1', // level1 baseB1
      '1', // level2 baseA1
      '0', // level2 baseB2
    ]);

    /*
      baseA, baseB, derived(baseA + baseB)
      S1[baseB, derived]: derived1(baseA1 + baseB1)
      S2[baseB]: derived1(baseA1 + baseB2)
    */
    clickButton(container, increaseLevel2All);
    expect(getTextContents(container, atomValueSelectors)).toEqual([
      '2', // level1 baseA1
      '1', // level1 baseB1
      '2', // level2 baseA1
      '1', // level2 baseB2
    ]);
  });
});
