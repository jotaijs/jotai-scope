import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Atom, WritableAtom } from 'jotai';
import {
  useAtom as useAtomOrig,
  useAtomValue as useAtomValueOrig,
  useSetAtom as useSetAtomOrig,
} from 'jotai/react';
import { useHydrateAtoms as useHydrateAtomsOrig } from 'jotai/react/utils';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;

const ScopeContext = createContext<GetScopedAtom>((a) => a);

export const ScopeProvider = ({
  atoms,
  children,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
}) => {
  const getParentScopedAtom = useContext(ScopeContext);
  const mapping = new WeakMap<AnyAtom, AnyAtom>();
  const atomSet = new Set(atoms);

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
        return delegate ? getParentScopedAtom(orig as A) : target;
      }
      return getScopedAtom(target);
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

  return (
    <ScopeContext.Provider value={getScopedAtom}>
      {children}
    </ScopeContext.Provider>
  );
};

export const useScopedAtom = <T extends Atom<any>>(anAtom: T): T => {
  const getScopedAtom = useContext(ScopeContext);
  return getScopedAtom(anAtom);
};

export const useAtom = ((anAtom: AnyAtom, ...args: any[]) =>
  useAtomOrig(useScopedAtom(anAtom), ...args)) as typeof useAtomOrig;

export const useAtomValue = ((anAtom: AnyAtom, ...args: any[]) =>
  useAtomValueOrig(useScopedAtom(anAtom), ...args)) as typeof useAtomValueOrig;

export const useSetAtom = ((anAtom: AnyWritableAtom, ...args: any[]) =>
  useSetAtomOrig(useScopedAtom(anAtom), ...args)) as typeof useSetAtomOrig;

export const useHydrateAtoms = ((
  values: Iterable<readonly [AnyAtom, unknown]>,
  ...args: any[]
) => {
  const getScopedAtom = useContext(ScopeContext);
  const scopedValues = new Map();
  for (const [atom, value] of values) {
    scopedValues.set(getScopedAtom(atom), value);
  }
  return useHydrateAtomsOrig(scopedValues, ...args);
}) as typeof useHydrateAtomsOrig;
