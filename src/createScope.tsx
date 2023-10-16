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

  const Provider = ({
    atoms,
    children,
  }: {
    atoms: Iterable<AnyAtom>;
    children: ReactNode;
  }) => {
    const getParentScopedAtom = useContext(ScopeContext);
    const mapping = new WeakMap<AnyAtom, AnyAtom>();
    const atomSet = new Set(atoms);

    const createScopedAtom = <T extends AnyAtom>(
      anAtom: T,
      delegate: boolean,
    ): T => {
      const scopedAtom = Object.assign({}, anAtom) as typeof anAtom;
      const getAtom = <A extends AnyAtom>(thisArg: unknown, target: A) => {
        if (target === thisArg) {
          return delegate ? getParentScopedAtom(target) : target;
        }
        return getScopedAtom(target);
      };
      if ('read' in scopedAtom) {
        scopedAtom.read = function read(get, opts) {
          return anAtom.read.call(this, (a) => get(getAtom(this, a)), opts);
        };
      }
      if ('write' in scopedAtom) {
        (scopedAtom as unknown as AnyWritableAtom).write = function write(
          get,
          set,
          ...args
        ) {
          return (anAtom as unknown as AnyWritableAtom).write.call(
            this,
            (a) => get(getAtom(this, a)),
            (a, ...v) => set(getAtom(this, a), ...v),
            ...args,
          );
        };
      }
      return scopedAtom;
    };

    const getScopedAtom: GetScopedAtom = (anAtom) => {
      let scopedAtom = mapping.get(anAtom) as typeof anAtom | undefined;
      if (!scopedAtom) {
        scopedAtom = atomSet.has(anAtom)
          ? createScopedAtom(anAtom, false)
          : createScopedAtom(anAtom, true);
        mapping.set(anAtom, scopedAtom);
      }
      return scopedAtom;
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

  return { Provider, useAtom, useAtomValue, useSetAtom };
}

export const { Provider, useAtom, useAtomValue, useSetAtom } = createScope();
