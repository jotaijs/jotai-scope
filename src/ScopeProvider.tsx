import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import { getDefaultStore } from 'jotai/vanilla';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetInterceptedAtomCopy = <T extends AnyAtom>(anAtom: T) => T;
type GetStoreKey = <T extends AnyAtom>(anAtom: T) => T;

const isSelfAtom = (atom: AnyAtom, a: AnyAtom) =>
  atom.unstable_is ? atom.unstable_is(a) : a === atom;
const isEqualSet = (a: Set<unknown>, b: Set<unknown>) =>
  a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
type Store = ReturnType<typeof getDefaultStore>;
export const ScopeContext = createContext<
  readonly [GetStoreKey, Store | undefined]
>([(a) => a, undefined]);
export const ScopeProvider = ({
  atoms,
  children,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
}) => {
  const parentScopeContext = useContext(ScopeContext);
  const atomSet = new Set(atoms);
  const [getParentStoreKey, storeOrUndefined] = parentScopeContext;
  const parentStore = useStore();
  const store = storeOrUndefined ?? parentStore;

  const initialize = () => {
    const mapping = new WeakMap<AnyAtom, AnyAtom>();

    /**
     * Create a copy of originalAtom, then intercept its read/write function
     * to guarantee it accesses the correct value.
     * @param originalAtom
     * @param markedAsScoped Whether the atom is marked as scoped.
     * @returns A copy of originalAtom.
     */
    const interceptAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
      markedAsScoped: boolean,
    ): T => {
      /**
       * This is the core mechanism of how an intercepted atom finds the correct
       * atom to read/write.
       *
       * When an scoped atom call get(anotherAtom) or set(anotherAtom, value), this
       * function is called to "route" `anotherAtom` to the correct atom.
       * @param orig The unscoped original atom of this scoped atom.
       * @param target The `anotherAtom` that this atom is accessing.
       * @returns The actual atom to access. If the atom is scoped, return an
       * interceptedAtomCopy. Otherwise, return the unscoped original atom.
       *
       * Check the example below, when calling useAtomValue, jotai-scope will first
       * find its intercepted copy (lets call it `anAtomIntercepted`). Then,
       * `anAtom.read(get => get(dependencyAtom))` becomes
       * `anAtomIntercepted.read(get => get(getAtom(anAtom, dependencyAtom)))`
       * @example
       * const anAtom = atom(get => get(dependencyAtom))
       * const Component = () => {
       *  useAtomValue(anAtom);
       * }
       * const App = () => {
       *   return (
       *    <ScopeProvider atoms={[anAtom]}>
       *      <Component />
       *    </ScopeProvider>
       *   );
       * }
       */
      const getAtom = <A extends AnyAtom>(orig: AnyAtom, target: A): A => {
        // If a target is got/set by itself, then it is not derived.
        // Target could be an intercepted copy, so target is on the left.
        if (isSelfAtom(target, orig)) {
          // Since it is not derived, we check if it is marked as scoped.
          return markedAsScoped
            ? // If it is scoped, then current scope's intercepted copy is the store key
              getInterceptedAtomCopy(target)
            : // Otherwise, find the correct store key in the parent's scope.
              // Check `getStoreKey` for details.
              getParentStoreKey(target);
        }
        // If a target is got/set by another atom, route the access to the
        // target's intercepted copy, then repeat the procedure.
        return getInterceptedAtomCopy(target);
      };

      const interceptedAtomCopy: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read(
              (a) => get(getAtom(originalAtom, a)),
              opts,
            );
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write(
              (a) => get(getAtom(originalAtom, a)),
              (a, ...v) => set(getAtom(originalAtom, a), ...v),
              ...args,
            );
          },
        }),
        // eslint-disable-next-line camelcase
        unstable_is: (a: AnyAtom) => isSelfAtom(a, originalAtom),
      };
      return interceptedAtomCopy;
    };

    /**
     * Always create a copy in each scope for each atom, no matter it is marked as
     * scoped or not. Then intercept its read/write function to guarantee it accesses
     * the correct value.
     * @param originalAtom The atom to access.
     * @returns The copy of originalAtom.
     */
    const getInterceptedAtomCopy: GetInterceptedAtomCopy = (originalAtom) => {
      let interceptedAtomCopy = mapping.get(originalAtom);
      if (!interceptedAtomCopy) {
        interceptedAtomCopy = atomSet.has(originalAtom)
          ? interceptAtom(originalAtom as unknown as AnyWritableAtom, true)
          : interceptAtom(originalAtom as unknown as AnyWritableAtom, false);
        mapping.set(originalAtom, interceptedAtomCopy);
      }
      return interceptedAtomCopy as typeof originalAtom;
    };

    /**
     * When a child scope's intercepted atom try to find the correct
     * atom as the store key, this function is called. If the atom
     * is marked as scoped in this scope, return its intercepted copy.
     * Otherwise, recursively find the key in the parent scope.
     * @param originalAtom The atom to access.
     * @returns An intercepted copy if this atom is marked as scoped
     * in this scope. Otherwise, recursively call this function in the
     * parent scope.
     */
    const getStoreKey: GetStoreKey = (originalAtom) => {
      if (atomSet.has(originalAtom)) {
        let interceptedAtomCopy = mapping.get(originalAtom);
        if (!interceptedAtomCopy) {
          interceptedAtomCopy = interceptAtom(
            originalAtom as unknown as AnyWritableAtom,
            false,
          );
          mapping.set(originalAtom, interceptedAtomCopy);
        }
        return interceptedAtomCopy as typeof originalAtom;
      }
      return getParentStoreKey(originalAtom);
    };

    /**
     * When an atom is accessed via useAtomValue/useSetAtom, the access should
     * be handled by their intercepted copy.
     */
    const patchedStore: typeof store = {
      ...store,
      get: (anAtom, ...args) =>
        store.get(getInterceptedAtomCopy(anAtom), ...args),
      set: (anAtom, ...args) =>
        store.set(getInterceptedAtomCopy(anAtom), ...args),
      sub: (anAtom, ...args) =>
        store.sub(getInterceptedAtomCopy(anAtom), ...args),
    };

    const scopeContext = [getStoreKey, store] as const;

    return [patchedStore, scopeContext, parentScopeContext, atomSet] as const;
  };

  const [state, setState] = useState(initialize);
  if (parentScopeContext !== state[2] || !isEqualSet(atomSet, state[3])) {
    setState(initialize);
  }
  const [patchedStore, scopeContext] = state;

  return (
    <ScopeContext.Provider value={scopeContext}>
      <Provider store={patchedStore}>{children}</Provider>
    </ScopeContext.Provider>
  );
};
