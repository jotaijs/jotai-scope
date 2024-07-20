import { type ReactNode, useState } from 'react';
import { Provider, useStore } from 'jotai/react';
import type { Atom, getDefaultStore } from 'jotai/vanilla';

type Store = ReturnType<typeof getDefaultStore>;
type NamedStore = Store & { name?: string };

type ScopeProviderProps = {
  atoms: Iterable<Atom<unknown>>;
  debugName?: string;
  store?: Store;
  children: ReactNode;
};
export function ScopeProvider(props: ScopeProviderProps) {
  const { atoms, children, debugName, ...options } = props;
  const baseStore = useStore(options);
  const scopedAtoms = new Set(atoms);

  function initialize() {
    return {
      scopedStore: createScopedStore(baseStore, scopedAtoms, debugName),
      hasChanged(current: {
        baseStore: Store;
        scopedAtoms: Set<Atom<unknown>>;
      }) {
        return (
          !isEqualSet(scopedAtoms, current.scopedAtoms) ||
          current.baseStore !== baseStore
        );
      },
    };
  }

  const [{ hasChanged, scopedStore }, setState] = useState(initialize);
  if (hasChanged({ scopedAtoms, baseStore })) {
    setState(initialize);
  }
  return <Provider store={scopedStore}>{children}</Provider>;
}

function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
}

/**
 * @returns a derived store that intercepts get and set calls to apply the scope
 */
export function createScopedStore(
  baseStore: Store,
  scopedAtoms: Set<Atom<unknown>>,
  debugName?: string,
) {
  const derivedStore: NamedStore = baseStore.unstable_derive((getAtomState) => {
    const scopedAtomStateMap = new WeakMap();
    const scopedAtomStateSet = new WeakSet();
    return [
      (atom, originAtomState) => {
        if (
          scopedAtomStateSet.has(originAtomState as never) ||
          scopedAtoms.has(atom)
        ) {
          let atomState = scopedAtomStateMap.get(atom);
          if (!atomState) {
            atomState = { d: new Map(), p: new Set(), n: 0 };
            scopedAtomStateMap.set(atom, atomState);
            scopedAtomStateSet.add(atomState);
          }
          return atomState;
        }
        return getAtomState(atom, originAtomState);
      },
    ];
  });
  if (debugName) {
    derivedStore.name = debugName;
  }
  return derivedStore;
}
