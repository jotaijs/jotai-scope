import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import {
  useAtom as useAtomOrig,
  useAtomValue as useAtomValueOrig,
  useSetAtom as useSetAtomOrig,
} from 'jotai/react';
import type { Atom, WritableAtom } from 'jotai';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;

export function createScope() {
  const ScopeContext = createContext<GetScopedAtom>((a) => a);

  const ScopeProvider = ({
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

  const useAtom = ((anAtom: any, options?: any) => {
    const getScopedAtom = useContext(ScopeContext);
    return useAtomOrig(getScopedAtom(anAtom), options);
  }) as typeof useAtomOrig;

  const useAtomValue = ((anAtom: any, options?: any) => {
    const getScopedAtom = useContext(ScopeContext);
    return useAtomValueOrig(getScopedAtom(anAtom), options);
  }) as typeof useAtomValueOrig;

  const useSetAtom = ((anAtom: any, options?: any) => {
    const getScopedAtom = useContext(ScopeContext);
    return useSetAtomOrig(getScopedAtom(anAtom), options);
  }) as typeof useSetAtomOrig;

  return { ScopeProvider, useAtom, useAtomValue, useSetAtom };
}

export const { ScopeProvider, useAtom, useAtomValue, useSetAtom } =
  createScope();
