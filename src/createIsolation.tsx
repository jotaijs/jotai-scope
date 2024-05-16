import { createContext, useContext, useRef } from 'react';
import type { ReactNode } from 'react';
import { createStore } from 'jotai/vanilla';
import type { WritableAtom } from 'jotai/vanilla';
import {
  useAtom as useAtomOrig,
  useAtomValue as useAtomValueOrig,
  useSetAtom as useSetAtomOrig,
  useStore as useStoreOrig,
} from 'jotai/react';
import { useHydrateAtoms } from 'jotai/react/utils';

type Store = ReturnType<typeof createStore>;
type AnyWritableAtom = WritableAtom<unknown, any[], any>;

export function createIsolation() {
  const StoreContext = createContext<Store | null>(null);

  function Provider({
    store,
    initialValues = [],
    children,
  }: {
    store?: Store;
    initialValues?: Iterable<readonly [AnyWritableAtom, unknown]>;
    children: ReactNode;
  }) {
    const storeRef = useRef(store);
    if (!storeRef.current) {
      storeRef.current = createStore();
    }
    useHydrateAtoms(initialValues as any, { store: storeRef.current });
    return (
      <StoreContext.Provider value={storeRef.current}>
        {children}
      </StoreContext.Provider>
    );
  }

  const useStore = ((options?: any) => {
    const store = useContext(StoreContext);
    if (!store) throw new Error('Missing Provider from createIsolation');
    return useStoreOrig({ store, ...options });
  }) as typeof useStoreOrig;

  const useAtom = ((anAtom: any, options?: any) => {
    const store = useStore();
    return useAtomOrig(anAtom, { store, ...options });
  }) as typeof useAtomOrig;

  const useAtomValue = ((anAtom: any, options?: any) => {
    const store = useStore();
    return useAtomValueOrig(anAtom, { store, ...options });
  }) as typeof useAtomValueOrig;

  const useSetAtom = ((anAtom: any, options?: any) => {
    const store = useStore();
    return useSetAtomOrig(anAtom, { store, ...options });
  }) as typeof useSetAtomOrig;

  return { Provider, useStore, useAtom, useAtomValue, useSetAtom };
}
