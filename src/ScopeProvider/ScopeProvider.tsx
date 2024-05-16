import { Provider, useStore } from 'jotai/react';
import {
  type ReactNode,
  createContext,
  useContext,
  useState,
  useRef,
} from 'react';
import { createScope, type Scope } from './scope';
import { AnyAtom, Store } from './types';

const ScopeContext = createContext<{
  scope: Scope | undefined;
  baseStore: Store | undefined;
}>({
  scope: undefined,
  baseStore: undefined,
});

const patchedStoreSymbol = Symbol();

export function ScopeProvider({
  atoms,
  children,
  className,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
  className?: string;
}) {
  const log = console.log.bind(console, className);
  const renderCountRef = useRef(0);
  log('ScopeProvider render', renderCountRef.current++);
  const parentStore = useStore();
  let { scope: parentScope, baseStore = parentStore } =
    useContext(ScopeContext);
  if (!(patchedStoreSymbol in parentStore)) {
    parentScope = undefined;
    baseStore = parentStore;
  }

  /**
   * atomSet is used to detect if the atoms prop has changed.
   */
  const atomSet = new Set(atoms);

  const initializeCountRef = useRef(0);
  function initialize() {
    console.log(
      className,
      'ScopeProvider initialize',
      initializeCountRef.current++,
    );
    const scope = createScope(atoms, parentScope, className);
    const patchedStore: Store & { [patchedStoreSymbol]: true } & {
      name: string | undefined;
    } = {
      // TODO: update this patch to support devtools
      ...baseStore,
      get(anAtom) {
        log(this.name, 'get', anAtom.debugLabel);
        return baseStore.get(scope.getAtom(anAtom));
      },
      set(anAtom, ...args) {
        log(this.name, 'set', anAtom.debugLabel);
        return baseStore.set(scope.getAtom(anAtom), ...args);
      },
      sub(anAtom, ...args) {
        log(this.name, 'sub', anAtom.debugLabel);
        return baseStore.sub(scope.getAtom(anAtom), ...args);
      },
      [patchedStoreSymbol]: true,
      name: `${className}:store`,
    };

    return {
      patchedStore,
      scopeContext: { scope, baseStore },
      hasChanged(current: {
        baseStore: Store;
        parentScope: Scope | undefined;
        atomSet: Set<AnyAtom>;
      }) {
        return (
          parentScope !== current.parentScope ||
          !isEqualSet(atomSet, current.atomSet) ||
          current.baseStore !== baseStore
        );
      },
    };
  }

  const [state, setState] = useState(initialize);
  const { hasChanged, scopeContext, patchedStore } = state;
  if (hasChanged({ parentScope, atomSet, baseStore })) {
    setState(initialize);
  }
  console.log(
    className,
    'ScopeProvider return',
    Array.from(atoms).map((a) => a.debugLabel),
  );
  return (
    <ScopeContext.Provider value={scopeContext}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
}

function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
}
