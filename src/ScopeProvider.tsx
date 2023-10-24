import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;

export const ScopeContext = createContext<
  readonly [GetScopedAtom, Set<AnyAtom>]
>([(a) => a, new Set()]);

export const ScopeProvider = ({
  atoms,
  children,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
}) => {
  const [getParentScopedAtom, parentScopedAtoms] = useContext(ScopeContext);
  const getScopedAtomAndScopedAtoms = useMemo(() => {
    const mapping = new WeakMap<AnyAtom, AnyAtom>();
    const atomSet = new Set(atoms);
    const scopedAtoms = new Set([...parentScopedAtoms, ...atoms] as AnyAtom[]);
    const createScopedAtom = <T extends AnyWritableAtom>(
      anAtom: T,
      delegate: boolean,
    ): T => {
      const getAtom = <A extends AnyAtom>(
        thisArg: AnyAtom,
        orig: AnyAtom,
        target: A,
      ): A => {
        if (target === thisArg) {
          return delegate
            ? scopedAtoms.has(orig)
              ? getParentScopedAtom(orig as A)
              : orig
            : target;
        }
        return scopedAtoms.has(target) ? getScopedAtom(target) : target;
      };
      const scopedAtom: typeof anAtom = {
        ...anAtom,
        ...('read' in anAtom && {
          read(get, opts) {
            return anAtom.read.call(
              this,
              (a) => get(getAtom(this, anAtom, a)),
              opts,
            );
          },
        }),
        ...('write' in anAtom && {
          write(get, set, ...args) {
            return anAtom.write.call(
              this,
              (a) => get(getAtom(this, anAtom, a)),
              (a, ...v) => set(getAtom(this, anAtom, a), ...v),
              ...args,
            );
          },
        }),
      };
      return scopedAtom;
    };

    const getScopedAtom: GetScopedAtom = (anAtom) => {
      let scopedAtom = mapping.get(anAtom);
      if (!scopedAtom) {
        scopedAtom = atomSet.has(anAtom)
          ? createScopedAtom(anAtom as unknown as AnyWritableAtom, false)
          : createScopedAtom(anAtom as unknown as AnyWritableAtom, true);
        mapping.set(anAtom, scopedAtom);
      }
      return scopedAtom as typeof anAtom;
    };

    return [getScopedAtom, scopedAtoms] as const;
  }, [getParentScopedAtom, parentScopedAtoms, atoms]);

  const [getScopedAtom] = getScopedAtomAndScopedAtoms;
  const store = useStore();
  const patchedStore: typeof store = {
    ...store,
    get: (anAtom, ...args) => store.get(getScopedAtom(anAtom), ...args),
    set: (anAtom, ...args) => store.set(getScopedAtom(anAtom), ...args),
    sub: (anAtom, ...args) => store.sub(getScopedAtom(anAtom), ...args),
  };

  return (
    <ScopeContext.Provider value={getScopedAtomAndScopedAtoms}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
};
