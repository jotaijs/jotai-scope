import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Provider, useStore } from 'jotai/react';
import { getDefaultStore } from 'jotai/vanilla';
import type { Atom, WritableAtom } from 'jotai/vanilla';

type AnyAtom = Atom<unknown>;
type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>;
type GetRouterAtom = <T extends AnyAtom>(anAtom: T) => T;
type GetScopedAtom = <T extends AnyAtom>(anAtom: T) => T;
type RouteAtomInScope = <T extends AnyAtom>(anAtom: T) => T;

const isSelfAtom = (atom: AnyAtom, a: AnyAtom) =>
  atom.unstable_is ? atom.unstable_is(a) : a === atom;
const isEqualSet = (a: Set<unknown>, b: Set<unknown>) =>
  a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)));
type Store = ReturnType<typeof getDefaultStore>;

export const ScopeContext = createContext<
  readonly [RouteAtomInScope, Store | undefined]
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
  const [routeAtomInParentScope, storeOrUndefined] = parentScopeContext;
  const parentStore = useStore();
  const store = storeOrUndefined ?? parentStore;

  const initialize = () => {
    const routerAtoms = new WeakMap<AnyAtom, AnyAtom>();
    const scopedAtoms = new WeakMap<AnyAtom, AnyAtom>();

    /**
     * Create a router copy of originalAtom. Router atom will NEVER act as a store key to access
     * states, but it intercepts originalAtom's read/write function. If originalAtom is scoped, then
     * it will finally routes to a scoped atom copy which owns its own state in the store. If
     * originalAtom is not scoped, it will finally routes to the global unique atom (the
     * originalAtom itself).
     * @param originalAtom
     * @param isScoped Whether the atom is marked as scoped.
     * @returns A copy of originalAtom which acts as a router.
     */
    const createRouterAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
      isScoped: boolean,
    ): T => {
      /**
       * This is the core mechanism of how a router atom finds the correct atom to read/write.
       *
       * When an router atom call get(anotherAtom) or set(anotherAtom, value), this
       * function is called to route `anotherAtom` to another atom. That atom would be used as
       * store key to access the globally shared / scoped state.
       * @param orig The globally accessible original atom of this router atom.
       * @param target The `anotherAtom` that this atom is accessing.
       * @returns The actual atom to access. If the atom is scoped, return an
       * scoped copy. Otherwise, return the unscoped original atom.
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
      const routeAtom = <A extends AnyAtom>(orig: AnyAtom, target: A): A => {
        // If original atom is scoped, then itself and all of its dependencies are scoped. Route to
        // the scoped atom copy.
        if (isScoped) {
          return getScopedAtom(target);
        }

        // If original atom is not scoped

        // The target is got/set by itself, but we do not know if it is scoped in parent scopes, so
        // the parent scope will route to the correct atom.
        if (isSelfAtom(target, orig)) {
          return routeAtomInParentScope(target);
        }

        // The target is got/set by another atom, access the target's router recursively.
        return getRouterAtom(target);
      };

      const routerAtom: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read(
              (a) => get(routeAtom(originalAtom, a)),
              opts,
            );
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write(
              (a) => get(routeAtom(originalAtom, a)),
              (a, ...v) => set(routeAtom(originalAtom, a), ...v),
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
     * Create a scoped copy of originalAtom. The scoped atom copy will act as a store key to access
     * its own state. All of an scopedAtom's dependencies are also scoped, so their read/write
     * functions will be intercepted to access the scoped copy.
     * @param originalAtom
     * @returns A copy of originalAtom which is scoped.
     */
    const createScopedAtom = <T extends AnyWritableAtom>(
      originalAtom: T,
    ): T => {
      const routerAtom: typeof originalAtom = {
        ...originalAtom,
        ...('read' in originalAtom && {
          read(get, opts) {
            return originalAtom.read((a) => get(getScopedAtom(a)), opts);
          },
        }),
        ...('write' in originalAtom && {
          write(get, set, ...args) {
            return originalAtom.write(
              (a) => get(getScopedAtom(a)),
              (a, ...v) => set(getScopedAtom(a), ...v),
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
     * For EVERY `useAtomValue` and `useSetAtom` call, since we don't know if the atom is scoped
     * or not, a router atom copy is always created to intercept the read/write function.
     */
    const getRouterAtom: GetRouterAtom = (originalAtom) => {
      let routerAtom = routerAtoms.get(originalAtom);
      if (!routerAtom) {
        routerAtom = createRouterAtom(
          originalAtom as unknown as AnyWritableAtom,
          atomSet.has(originalAtom),
        );
        routerAtoms.set(originalAtom, routerAtom);
      }
      return routerAtom as typeof originalAtom;
    };

    const getScopedAtom: GetScopedAtom = (originalAtom) => {
      let scopedAtom = scopedAtoms.get(originalAtom);
      if (!scopedAtom) {
        scopedAtom = createScopedAtom(
          originalAtom as unknown as AnyWritableAtom,
        );
        scopedAtoms.set(originalAtom, scopedAtom);
      }
      return scopedAtom as typeof originalAtom;
    };

    /**
     * When a child scope's router atom try to find the correct atom as the store key, this function
     * is called. If the atom is scoped in current scope, return its scoped copy. Otherwise,
     * recursively route to the correct atom in the parent scope.
     * @param originalAtom The atom to route.
     * @returns A scoped copy if this atom is marked as scoped in current scope. Otherwise,
     * recursively call this function in the parent scope.
     */
    const routeAtomInCurrentScope: RouteAtomInScope = (originalAtom) => {
      if (atomSet.has(originalAtom)) {
        return getScopedAtom(originalAtom);
      }
      return routeAtomInParentScope(originalAtom);
    };

    /**
     * When an atom is accessed via useAtomValue/useSetAtom, the access should
     * be handled by their router copy.
     */
    const patchedStore: typeof store = {
      ...store,
      get: (anAtom, ...args) => store.get(getRouterAtom(anAtom), ...args),
      set: (anAtom, ...args) => store.set(getRouterAtom(anAtom), ...args),
      sub: (anAtom, ...args) => store.sub(getRouterAtom(anAtom), ...args),
    };

    const scopeContext = [routeAtomInCurrentScope, store] as const;

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
