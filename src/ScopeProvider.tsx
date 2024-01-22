import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;

const isEqualSet = (a: Set<unknown>, b: Set<unknown>) =>
  a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));

export const ScopeContext = createContext<
  readonly [read: GetScopedAtom, write: GetScopedAtom]
>([(a) => a, (a) => a]);

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

    const [getParentScopedAtomToRead, getParentScopedAtomToWrite] =
      getParentScopedAtom;

    /**
     * Create a copy of originalAtom, then intercept its read/write function
     * to guarantee it accesses the correct value.
     * @param originalAtom
     * @param notMarkedAsScoped Whether the atom is NOT marked as scoped.
     * @returns A copy of originalAtom.
     */
    const createScopedAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
      notMarkedAsScoped: boolean,
    ): T => {
      /**
       * When an scoped atom call get(anotherAtom) or set(anotherAtom, value), we ensure `anotherAtom` be
       * scoped by calling this function.
       * @param thisArg The scoped atom.
       * @param orig The unscoped original atom of this scoped atom.
       * @param target The `anotherAtom` that this atom is accessing.
       * @returns The scoped target if needed.
       *
       * Check the example below, when calling useAtomValue, jotai-scope first finds the anonymous
       * scoped atom of `anAtom` (we call it `anAtomScoped`). Then, `anAtomScoped.read(dependencyAtom)`
       * becomes `getAtom(anAtomScoped, anAtom, dependencyAtom)`
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
      const getAtom = <A extends AnyAtom>(
        thisArg: AnyAtom,
        orig: AnyAtom,
        target: A,
      ): A => {
        if (target === thisArg) {
          return notMarkedAsScoped
            ? getParentScopedAtomToRead(orig as A)
            : target;
        }
        return getScopedAtomToRead(target);
      };
      const scopedAtom: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read.call(
              this,
              (a) => get(getAtom(this, originalAtom, a)),
              opts,
            );
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write.call(
              this,
              (a) => get(getAtom(this, originalAtom, a)),
              (a, ...v) => set(getAtom(this, originalAtom, a), ...v),
              ...args,
            );
          },
        }),
      };
      return scopedAtom;
    };

    /**
     * When reading/subscribing an atom, always create a copy in each scope
     * for each atom, no matter it is marked as scoped or not. Then
     * intercept its read/write function to guarantee it accesses the
     * correct value.
     * @param originalAtom The atom to access.
     * @returns The copy of originalAtom.
     */
    const getScopedAtomToRead: GetScopedAtom = (originalAtom) => {
      let scopedAtom = mapping.get(originalAtom);
      if (!scopedAtom) {
        scopedAtom = atomSet.has(originalAtom)
          ? createScopedAtom(originalAtom as unknown as AnyWritableAtom, false)
          : createScopedAtom(originalAtom as unknown as AnyWritableAtom, true);
        mapping.set(originalAtom, scopedAtom);
      }
      return scopedAtom as typeof originalAtom;
    };

    /**
     * When writing an atom, directly check if the atom is marked as scoped or not.
     * If marked as scoped, return its scoped copy. Otherwise, return the original
     * one.
     * @param originalAtom The atom to access.
     * @returns The copy of originalAtom, or originalAtom itself.
     */
    const getScopedAtomToWrite: GetScopedAtom = (originalAtom) => {
      if (atomSet.has(originalAtom)) {
        let scopedAtom = mapping.get(originalAtom);
        if (!scopedAtom) {
          scopedAtom = createScopedAtom(
            originalAtom as unknown as AnyWritableAtom,
            false,
          );
          mapping.set(originalAtom, scopedAtom);
        }
        return scopedAtom as typeof originalAtom;
      }
      return originalAtom;
    };

    const patchedStore: typeof store = {
      ...store,
      get: (anAtom, ...args) => store.get(getScopedAtomToRead(anAtom), ...args),
      set: (anAtom, ...args) =>
        store.set(getScopedAtomToWrite(anAtom), ...args),
      sub: (anAtom, ...args) => store.sub(getScopedAtomToRead(anAtom), ...args),
    };

    return [
      patchedStore,
      [getScopedAtomToRead, getScopedAtomToWrite],
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
