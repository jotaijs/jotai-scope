import { createContext, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react';
import { createStore } from 'jotai/vanilla';
import type { Atom } from 'jotai';

type Store = ReturnType<typeof createStore>;
type AnyAtom = Atom<unknown>;

export function createScope() {
  const ScopeContext = createContext<Map<AnyAtom, Store>>(new Map());

  const ScopeProvider = ({
    atoms,
    children,
  }: {
    atoms: Iterable<AnyAtom>;
    children: ReactNode;
  }) => {
    const storeRef = useRef<Store>();
    if (!storeRef.current) {
      storeRef.current = createStore();
    }
    const store = storeRef.current;
    const parentMap = useContext(ScopeContext);
    const map = new Map(parentMap);
    Array.from(atoms).forEach((anAtom) => {
      map.set(anAtom, store);
    });
    return (
      <ScopeContext.Provider value={map}>{children}</ScopeContext.Provider>
    );
  };

  const useScopeAtom = ((anAtom: any, options?: any) => {
    const map = useContext(ScopeContext);
    const store = map.get(anAtom);
    return useAtom(anAtom, { store, ...options });
  }) as typeof useAtom;

  const useScopeAtomValue = ((anAtom: any, options?: any) => {
    const map = useContext(ScopeContext);
    const store = map.get(anAtom);
    return useAtomValue(anAtom, { store, ...options });
  }) as typeof useAtomValue;

  const useScopeSetAtom = ((anAtom: any, options?: any) => {
    const map = useContext(ScopeContext);
    const store = map.get(anAtom);
    return useSetAtom(anAtom, { store, ...options });
  }) as typeof useSetAtom;

  return { ScopeProvider, useScopeAtom, useScopeAtomValue, useScopeSetAtom };
}

export const {
  ScopeProvider,
  useScopeAtom,
  useScopeAtomValue,
  useScopeSetAtom,
} = createScope();
