import type { Store, Scope } from './types';

function PatchedStore() {}

/**
 * @returns a patched store that intercepts get and set calls to apply the scope
 */
export function createPatchedStore(baseStore: Store, scope: Scope): Store {
  const store: Store = {
    ...baseStore,
    get(anAtom, ...args) {
      const [scopedAtom] = scope.getAtom(anAtom);
      return baseStore.get(scopedAtom, ...args);
    },
    set(anAtom, ...args) {
      const [scopedAtom, implicitScope] = scope.getAtom(anAtom);
      const restore = scope.prepareWriteAtom(scopedAtom, anAtom, implicitScope);
      try {
        return baseStore.set(scopedAtom, ...args);
      } finally {
        restore?.();
      }
    },
    sub(anAtom, ...args) {
      const [scopedAtom] = scope.getAtom(anAtom);
      return baseStore.sub(scopedAtom, ...args);
    },
    // TODO: update this patch to support devtools
  };
  return Object.assign(Object.create(PatchedStore.prototype), store);
}

/**
 * @returns true if the current scope is the first descendant scope under Provider
 */
export function isTopLevelScope(parentStore: Store) {
  return !(parentStore instanceof PatchedStore);
}
