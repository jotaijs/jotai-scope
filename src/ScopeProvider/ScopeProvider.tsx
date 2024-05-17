import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import { getDefaultStore } from 'jotai/vanilla';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetRouterAtom = <T extends AnyAtom>(anAtom: T) => T;
type TryGetScopedRouterAtomInCurrentScope = <T extends AnyAtom>(
  anAtom: T,
) => [anAtomOrScoped: T, isScoped: boolean];

const isSelfAtom = (atom: AnyAtom, a: AnyAtom) =>
  atom.unstable_is ? atom.unstable_is(a) : a === atom;
const isEqualSet = (a: Set<unknown>, b: Set<unknown>) =>
  a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
type Store = ReturnType<typeof getDefaultStore>;

export const ScopeContext = createContext<
  readonly [TryGetScopedRouterAtomInCurrentScope, Store | undefined]
>([(a) => [a, false], undefined]);
export const ScopeProvider = ({
  atoms,
  children,
}: {
  atoms: Iterable<AnyAtom>;
  children: ReactNode;
}) => {
  const parentScopeContext = useContext(ScopeContext);
  const atomSet = new Set(atoms);
  const [tryGetScopedRouterAtomInParentScope, storeOrUndefined] =
    parentScopeContext;
  const parentStore = useStore();
  const store = storeOrUndefined ?? parentStore;

  const initialize = () => {
    const commonRouterAtoms = new WeakMap<AnyAtom, AnyAtom>();
    const scopedRouterAtoms = new WeakMap<AnyAtom, AnyAtom>();

    /**
     * Create a CommonRouterAtom copy of originalAtom. CommonRouterAtom will NEVER act as a store
     * key to access states, but it intercepts originalAtom's read/write function. If some of
     * originalAtom's dependencies are scoped, the read/write function will be intercepted to access the correct
     * ScopedRouterAtom copy.
     *
     * NOTE: CommonRouterAtom is only used when originalAtom is not scoped in any scope. That logic
     * is guaranteed by `getRouterAtom`.
     *
     * @see getRouterAtom
     * @param originalAtom
     * @returns A CommonRouterAtom of originalAtom.
     */
    const createCommonRouterAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
    ): T => {
      /**
       * This is the core mechanism of how a router atom finds the correct atom to read/write.
       *
       * First, we know that originalAtom is not scoped in any scope, the logic is guaranteed by
       * `getRouterAtom`.
       *
       * Then, when the CommonRouterAtom call get(targetAtom) or set(targetAtom, value), this
       * function is called to route `targetAtom` to another atom. That atom would be used as
       * store key to access the globally shared / scoped state.
       * @param target The `targetAtom` that this atom is accessing.
       * @returns The actual atom to access. If the atom is originalAtom itself, return
       * originalAtom. If the atom is scoped, return a ScopedRouterAtom copy. Otherwise, return the
       * unscoped CommonRouterAtom copy.
       *
       * Check the example below, when calling useAtomValue, jotai-scope will first
       * find its router copy (lets call it `rAtom`). Then,
       * `anAtom.read(get => get(dependencyAtom))` becomes
       * `rAtom.read(get => get(routeAtom(anAtom, dependencyAtom)))`
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
      const routeAtom = <A extends AnyAtom>(target: A): A => {
        // The target is got/set by itself. Since we know originalAtom is not scoped in any scope,
        // directly return the originalAtom itself.
        if (target === (originalAtom as unknown as A)) {
          return target;
        }

        // The target is got/set by another atom, access the target's router atom.
        return getRouterAtom(target);
      };

      const routerAtom: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read((a) => get(routeAtom(a)), opts);
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write(
              (a) => get(routeAtom(a)),
              (a, ...v) => set(routeAtom(a), ...v),
              ...args,
            );
          },
        }),
        // eslint-disable-next-line camelcase
        unstable_is: (a: AnyAtom) => isSelfAtom(a, originalAtom),
      };
      return routerAtom;
    };

    /**
     * Create a ScopedRouterAtom copy of originalAtom. The ScopedRouterAtom will act as a store key
     * to access its own state. All of a ScopedRouterAtom's dependencies are also scoped, so their
     * read/write functions will be intercepted to access ScopedRouterAtom copy, too.
     * @param originalAtom
     * @returns A ScopedRouterAtom copy of originalAtom.
     */
    const createScopedRouterAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
    ): T => {
      const scopedRouterAtom: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read((a) => get(getScopedRouterAtom(a)), opts);
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write(
              (a) => get(getScopedRouterAtom(a)),
              (a, ...v) => set(getScopedRouterAtom(a), ...v),
              ...args,
            );
          },
        }),
        // eslint-disable-next-line camelcase
        unstable_is: (a: AnyAtom) => isSelfAtom(a, originalAtom),
      };
      return scopedRouterAtom;
    };

    /**
     * For EVERY `useAtomValue` and `useSetAtom` call, since we don't know if the atom is scoped
     * or not, a router atom copy is always created to intercept the read/write function.
     *
     * It first check if originalAtom is scoped in any scope. If so, then route to
     * `ScopedRouterAtom`. All of the atom's dependency will be scoped in that scope as well.
     * If not, then the atom is globally unique, route to `CommonRouterAtom`. The atom's
     * dependencies' scope status is not determined yet.
     */
    const getRouterAtom: GetRouterAtom = (originalAtom) => {
      // Step 1: Check if the atom is scoped in current scope.
      const [possiblyScoped, isScoped] =
        tryGetScopedRouterAtomInCurrentScope(originalAtom);

      // Step 2: If the atom is scoped, return the ScopedRouterAtom copy.
      if (isScoped) {
        return possiblyScoped;
      }

      // Step 3: If the atom is not scoped, return the CommonRouterAtom copy.
      let commonRouterAtom = commonRouterAtoms.get(originalAtom);
      if (!commonRouterAtom) {
        commonRouterAtom = createCommonRouterAtom(
          originalAtom as unknown as AnyWritableAtom,
        );
        commonRouterAtoms.set(originalAtom, commonRouterAtom);
      }
      return commonRouterAtom as typeof originalAtom;
    };

    const getScopedRouterAtom: GetRouterAtom = (originalAtom) => {
      let scopedRouterAtom = scopedRouterAtoms.get(originalAtom);
      if (!scopedRouterAtom) {
        scopedRouterAtom = createScopedRouterAtom(
          originalAtom as unknown as AnyWritableAtom,
        );
        scopedRouterAtoms.set(originalAtom, scopedRouterAtom);
      }
      return scopedRouterAtom as typeof originalAtom;
    };

    /**
     * If originalAtom is scoped in current scope, returns ScopedRouterAtom copy.
     * Otherwise, recursively check if originalAtom is scoped in parent scope.
     *
     * If the atom is not scoped in any scope, return the originalAtom itself.
     * The second return value indicates whether the atom is scoped in any scope.
     */
    const tryGetScopedRouterAtomInCurrentScope: TryGetScopedRouterAtomInCurrentScope =
      (originalAtom) => {
        if (atomSet.has(originalAtom)) {
          return [getScopedRouterAtom(originalAtom), true];
        }
        return tryGetScopedRouterAtomInParentScope(originalAtom);
      };

    /**
     * When an atom is accessed via useAtomValue/useSetAtom, the access should
     * be handled by a router atom copy.
     */
    const patchedStore: typeof store = {
      ...store,
      get: (anAtom, ...args) => store.get(getRouterAtom(anAtom), ...args),
      set: (anAtom, ...args) => store.set(getRouterAtom(anAtom), ...args),
      sub: (anAtom, ...args) => store.sub(getRouterAtom(anAtom), ...args),
    };

    const scopeContext = [tryGetScopedRouterAtomInCurrentScope, store] as const;

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
