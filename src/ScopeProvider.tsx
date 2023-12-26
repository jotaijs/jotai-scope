import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;

const isEqualSet = (a: Set<unknown>, b: Set<unknown>) =>
  a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));

export const ScopeContext = createContext<GetScopedAtom>((a) => a);

export const ScopeProvider = ({
  atoms,
  children,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
}) => {
  const store = useStore();
  const getParentScopedAtom = useContext(ScopeContext);
  const atomSet = new Set(atoms);

  const initialize = () => {
    const mapping = new WeakMap<AnyAtom, AnyAtom>();
    const createScopedAtom = <T extends AnyWritableAtom>(anAtom: T): T => {
      const getAtom = <A extends AnyAtom>(thisArg: AnyAtom, target: A): A => {
        return target === thisArg ? target : getScopedAtom(target);
      };

      const scopedAtom: typeof anAtom = {
        ...anAtom,
        ...('read' in anAtom && {
          read(get, opts) {
            return anAtom.read.call(this, (a) => get(getAtom(this, a)), opts);
          },
        }),
        ...('write' in anAtom && {
          write(get, set, ...args) {
            return anAtom.write.call(
              this,
              (a) => get(getAtom(this, a)),
              (a, ...v) => set(getAtom(this, a), ...v),
              ...args,
            );
          },
        }),
      };
      return scopedAtom;
    };
    const getInheritedAtom = <T extends AnyWritableAtom>(anAtom: T) => {
      return getParentScopedAtom(anAtom);
    };

    const getScopedAtom: GetScopedAtom = (anAtom) => {
      let scopedAtom = mapping.get(anAtom);
      if (!scopedAtom) {
        scopedAtom = atomSet.has(anAtom)
          ? createScopedAtom(anAtom as unknown as AnyWritableAtom)
          : getInheritedAtom(anAtom as unknown as AnyWritableAtom);
        mapping.set(anAtom, scopedAtom);
      }
      return scopedAtom as typeof anAtom;
    };

    const patchedStore: typeof store = {
      ...store,
      get: (anAtom, ...args) => store.get(getScopedAtom(anAtom), ...args),
      set: (anAtom, ...args) => store.set(getScopedAtom(anAtom), ...args),
      sub: (anAtom, ...args) => store.sub(getScopedAtom(anAtom), ...args),
    };

    return [
      patchedStore,
      getScopedAtom,
      store,
      getParentScopedAtom,
      atomSet,
    ] as const;
  };

  const [state, setState] = useState(initialize);
  if (
    store !== state[2] ||
    getParentScopedAtom !== state[3] ||
    !isEqualSet(atomSet, state[4])
  ) {
    setState(initialize);
  }
  const [patchedStore, getScopedAtom] = state;

  return (
    <ScopeContext.Provider value={getScopedAtom}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
};
