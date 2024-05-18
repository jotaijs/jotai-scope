import { Provider, useStore } from 'jotai/react';
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { createScope, type Scope } from './scope';
import type { AnyAtom, Store } from './types';

export const ScopeContext = createContext<{
  scope: Scope | undefined;
  baseStore: Store | undefined;
}>({ scope: undefined, baseStore: undefined });

export const ScopeProvider = ({
  atoms,
  children,
  debugName,
}: PropsWithChildren<{ atoms: Iterable<AnyAtom>; debugName?: string }>) => {
  const parentStore: Store = useStore();
  let { scope: parentScope, baseStore = parentStore } =
    useContext(ScopeContext);
  // if this scope is the first descendant scope under Provider then we don't want to inherit parentScope
  // https://github.com/jotaijs/jotai-scope/pull/33#discussion_r1604268003
  if (isTopLevelScope(parentStore)) {
    parentScope = undefined;
    baseStore = parentStore;
  }

  /**
   * atomSet is used to detect if the atoms prop has changed.
   */
  const atomSet = new Set(atoms);

  function initialize() {
    const scope = createScope(atoms, parentScope, debugName);

    /**
     * When an atom is accessed via useAtomValue/useSetAtom, the access should
     * be handled by a router atom copy.
     */
    const patchedStore: PatchedStore = {
      ...baseStore,
      get(anAtom, ...args) {
        const [scopedAtom] = scope.getAtom(anAtom);
        return baseStore.get(scopedAtom, ...args);
      },
      set(anAtom, ...args) {
        const [scopedAtom, implicitScope] = scope.getAtom(anAtom);
        const restore = scope.prepareWriteAtom(
          scopedAtom,
          anAtom,
          implicitScope,
        );
        try {
          return baseStore.set(scopedAtom, ...args);
        } finally {
          restore?.();
        }
      },
      sub(anAtom, ...args) {
        const [scopedAtom] = scope.getAtom(anAtom);
        return baseStore.sub(scopedAtom, ...args);
      },
      [isPatchedStore]: true,
      // TODO: update this patch to support devtools
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
  return (
    <ScopeContext.Provider value={scopeContext}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
};

function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
}

/**
 * @returns true if the current scope is the first descendant scope under Provider
 */
function isTopLevelScope(parentStore: Store) {
  return !(isPatchedStore in parentStore);
}

const isPatchedStore = Symbol();
type PatchedStore = Store & { [isPatchedStore]: true };
