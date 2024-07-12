import { Provider, useStore } from 'jotai/react';
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { createScope, type Scope } from './scope';
import type { AnyAtom, Store } from './types';
import { createPatchedStore, isTopLevelScope } from './patchedStore';

const ScopeContext = createContext<{
  scope: Scope | undefined;
  baseStore: Store | undefined;
  noScopeSet: Set<AnyAtom>;
}>({ scope: undefined, baseStore: undefined, noScopeSet: new Set() });

export const ScopeProvider = ({
  atoms,
  noScope = [],
  children,
  debugName,
}: PropsWithChildren<{
  atoms: Iterable<AnyAtom>;
  noScope?: Iterable<AnyAtom>;
  debugName?: string;
}>) => {
  const parentStore: Store = useStore();
  const { noScopeSet: parentNoScopeSet, ...parent } = useContext(ScopeContext);
  let { scope: parentScope, baseStore = parentStore } = parent;
  // if this ScopeProvider is the first descendant scope under Provider then it is the top level scope
  // https://github.com/jotaijs/jotai-scope/pull/33#discussion_r1604268003
  if (isTopLevelScope(parentStore)) {
    parentScope = undefined;
    baseStore = parentStore;
  }

  // atomSet is used to detect if the atoms prop has changed.
  const atomSet = new Set(atoms);
  // noScopeSet defines atoms that should not be scoped
  const noScopeSet = new Set([...noScope, ...parentNoScopeSet]);

  function initialize() {
    const scope = createScope(atoms, noScopeSet, parentScope, debugName);
    return {
      patchedStore: createPatchedStore(baseStore, scope),
      scopeContext: { scope, baseStore, noScopeSet },
      hasChanged(current: {
        parentScope: Scope | undefined;
        baseStore: Store;
        atomSet: Set<AnyAtom>;
        noScopeSet: Set<AnyAtom>;
      }) {
        return (
          parentScope !== current.parentScope ||
          current.baseStore !== baseStore ||
          !isEqualSet(atomSet, current.atomSet) ||
          !isEqualSet(noScopeSet, current.noScopeSet)
        );
      },
    };
  }

  const [state, setState] = useState(initialize);
  const { hasChanged, scopeContext, patchedStore } = state;
  if (hasChanged({ parentScope, baseStore, atomSet, noScopeSet })) {
    setState(initialize);
  }
  return (
    <ScopeContext.Provider value={scopeContext}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
};

function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
}
