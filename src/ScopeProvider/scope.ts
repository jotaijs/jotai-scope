import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import { INTERNAL_buildStoreRev2 as buildStore } from 'jotai/vanilla/internals'
import type { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import { __DEV__ } from '../env'
import type {
  AnyAtom,
  AnyAtomFamily,
  AnyWritableAtom,
  Scope,
  ScopedStore,
  StoreHookForAtoms,
  StoreHooks,
  WithOriginal,
} from '../types'
import { SCOPE } from '../types'
import {
  getBaseStoreState,
  isWritableAtom,
  setOriginalBuildingBlocks,
  toNameString,
} from '../utils'

const globalScopeKey: { name?: string } = {}
if (__DEV__) {
  globalScopeKey.name = 'unscoped'
  globalScopeKey.toString = toNameString
}

type GlobalScopeKey = typeof globalScopeKey

export function createScope({
  atomSet = new Set(),
  atomFamilySet = new Set(),
  parentStore,
  name: scopeName,
}: {
  atomSet?: Set<AnyAtom>
  atomFamilySet?: Set<AnyAtomFamily>
  parentStore: Store | ScopedStore
  name?: string
}): ScopedStore {
  const parentScope = SCOPE in parentStore ? parentStore[SCOPE] : undefined
  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>()

  const currentScope: Scope = {
    getAtom,
    cleanup() {
      for (const cleanup of cleanupFamiliesSet) {
        cleanup()
      }
    },
    prepareWriteAtom(atom, originalAtom, implicitScope, writeScope) {
      if (
        originalAtom.read === defaultRead &&
        isWritableAtom(originalAtom) &&
        isWritableAtom(atom) &&
        originalAtom.write !== defaultWrite &&
        currentScope !== implicitScope
      ) {
        // atom is writable with init and holds a value
        // we need to preserve the value, so we don't want to copy the atom
        // instead, we need to override write until the write is finished
        const { write } = originalAtom
        atom.write = createScopedWrite(
          originalAtom.write.bind(
            originalAtom
          ) as (typeof originalAtom)['write'],
          implicitScope,
          writeScope
        )
        return () => {
          atom.write = write
        }
      }
      return undefined
    },
  }

  if (scopeName && __DEV__) {
    currentScope.name = scopeName
    currentScope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of atomSet) {
    explicit.set(atom, [cloneAtom(atom, currentScope), currentScope])
  }

  const cleanupFamiliesSet = new Set<() => void>()
  for (const atomFamily of atomFamilySet) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicit.has(atom)) {
        explicit.set(atom, [cloneAtom(atom, currentScope), currentScope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen((e) => {
      if (e.type === 'CREATE' && !explicit.has(e.atom)) {
        explicit.set(e.atom, [cloneAtom(e.atom, currentScope), currentScope])
      } else if (!atomSet.has(e.atom)) {
        explicit.delete(e.atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }

  /**
   * Returns a scoped atom from the original atom.
   * @param atom
   * @param implicitScope the atom is implicitly scoped in the provided scope
   * @returns the scoped atom and the scope of the atom
   */
  function getAtom<T extends AnyAtom>(
    atom: T,
    implicitScope?: Scope
  ): [T, Scope?] {
    if (explicit.has(atom)) {
      return explicit.get(atom) as [T, Scope]
    }
    if (implicitScope === currentScope) {
      // dependencies of explicitly scoped atoms are implicitly scoped
      // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
      if (!implicit.has(atom)) {
        implicit.set(atom, [cloneAtom(atom, implicitScope), implicitScope])
      }
      return implicit.get(atom) as [T, Scope]
    }
    const scopeKey = implicitScope ?? globalScopeKey
    if (parentScope) {
      // inherited atoms are copied so they can access scoped atoms
      // but they are not explicitly scoped
      // dependencies of inherited atoms first check if they are explicitly scoped
      // otherwise they use their original scope's atom
      if (!inherited.get(scopeKey)?.has(atom)) {
        const [ancestorAtom, explicitScope] = parentScope.getAtom(
          atom,
          implicitScope
        )
        setInheritedAtom(
          inheritAtom(ancestorAtom, atom, explicitScope),
          atom,
          implicitScope,
          explicitScope
        )
      }
      return inherited.get(scopeKey)!.get(atom) as [T, Scope]
    }
    if (!inherited.get(scopeKey)?.has(atom)) {
      // non-primitive atoms may need to access scoped atoms
      // so we need to create a copy of the atom
      setInheritedAtom(inheritAtom(atom, atom), atom)
    }
    return inherited.get(scopeKey)!.get(atom) as [T, Scope?]
  }

  function setInheritedAtom<T extends AnyAtom>(
    scopedAtom: T,
    originalAtom: T,
    implicitScope?: Scope,
    explicitScope?: Scope
  ) {
    const scopeKey = implicitScope ?? globalScopeKey
    if (!inherited.has(scopeKey)) {
      inherited.set(scopeKey, new WeakMap())
    }
    inherited.get(scopeKey)!.set(
      originalAtom,
      [
        scopedAtom, //
        explicitScope,
      ].filter(Boolean) as [T, Scope?]
    )
  }

  /** @returns a copy of the atom for derived atoms or the original atom for primitive and writable atoms */
  function inheritAtom<T>(
    atom: Atom<T>,
    originalAtom: Atom<T>,
    implicitScope?: Scope
  ) {
    if (originalAtom.read !== defaultRead) {
      return cloneAtom(originalAtom, implicitScope)
    }
    return atom
  }

  /** @returns a scoped copy of the atom */
  function cloneAtom<T>(originalAtom: Atom<T>, implicitScope?: Scope) {
    // avoid reading `init` to preserve lazy initialization
    const propertyDescriptors = Object.getOwnPropertyDescriptors(originalAtom)
    Object.entries(propertyDescriptors)
      .filter(([k]) => ['read', 'write', 'debugLabel'].includes(k))
      .forEach(([, v]) => (v.configurable = true))
    const scopedAtom: WithOriginal<Atom<T>> = Object.create(
      Object.getPrototypeOf(originalAtom),
      propertyDescriptors
    )
    scopedAtom.originalAtom = originalAtom

    if (scopedAtom.read !== defaultRead) {
      scopedAtom.read = createScopedRead<typeof scopedAtom>(
        originalAtom.read.bind(originalAtom),
        implicitScope
      )
    }

    if (
      isWritableAtom(scopedAtom) &&
      isWritableAtom(originalAtom) &&
      scopedAtom.write !== defaultWrite
    ) {
      scopedAtom.write = createScopedWrite(
        originalAtom.write.bind(originalAtom),
        implicitScope
      )
    }
    if (__DEV__) {
      Object.defineProperty(scopedAtom, 'debugLabel', {
        get() {
          return `${originalAtom.debugLabel}@${currentScope.name}`
        },
        configurable: true,
        enumerable: true,
      })
    }

    return scopedAtom
  }

  function createScopedRead<T extends Atom<unknown>>(
    read: T['read'],
    implicitScope?: Scope
  ): T['read'] {
    return function scopedRead(get, opts) {
      return read(
        function scopedGet(a) {
          const [scopedAtom] = getAtom(a, implicitScope)
          return get(scopedAtom)
        }, //
        opts
      )
    }
  }

  function createScopedWrite<T extends AnyWritableAtom>(
    write: T['write'],
    implicitScope?: Scope,
    writeScope = implicitScope
  ): T['write'] {
    return function scopedWrite(get, set, ...args) {
      return write(
        function scopedGet(a) {
          const [scopedAtom] = getAtom(a, implicitScope)
          return get(scopedAtom)
        },
        function scopedSet(a, ...v) {
          const [scopedAtom] = getAtom(a, implicitScope)
          const restore = currentScope.prepareWriteAtom(
            scopedAtom,
            a,
            implicitScope,
            writeScope
          )
          try {
            return set(scopedAtom, ...v)
          } finally {
            restore?.()
          }
        },
        ...args
      )
    }
  }

  const scopedStore = createPatchedStore(parentStore, currentScope)
  return scopedStore
}

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)

/** @returns a patched store that intercepts get and set calls to apply the scope */
function createPatchedStore(parentStore: Store, scope: Scope): ScopedStore {
  const storeState = getBaseStoreState(parentStore)
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]

  const internalStoreHooks = {} as StoreHooks
  storeState[6] = internalStoreHooks
  storeState[21] = scopeStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = scopeStoreFn(storeSub)

  const storeHooks = {
    get c() {
      return patchStoreHook(internalStoreHooks.c)
    },
    set c(v) {
      internalStoreHooks.c = v!
    },
    get m() {
      return patchStoreHook(internalStoreHooks.m)
    },
    set m(v) {
      internalStoreHooks.m = v!
    },
    get u() {
      return patchStoreHook(internalStoreHooks.u)
    },
    set u(v) {
      internalStoreHooks.u = v!
    },
    get f() {
      return internalStoreHooks.f
    },
    set f(v) {
      internalStoreHooks.f = v
    },
  } as StoreHooks

  const scopedBuildingBlocks: BuildingBlocks = [...storeState]
  // scopedBuildingBlocks[0] = patchWeakMap(storeState[0]) // atomStateMap
  // scopedBuildingBlocks[1] = patchWeakMap(storeState[1]) // mountedMap
  scopedBuildingBlocks[2] = patchWeakMap(storeState[2]) // invalidatedAtoms
  // scopedBuildingBlocks[3] = patchSet(storeState[3]) // changedAtoms
  scopedBuildingBlocks[4] = storeState[4] // mountCallbacks
  scopedBuildingBlocks[5] = storeState[5] // unmountCallbacks
  scopedBuildingBlocks[6] = storeHooks // storeHooks
  // scopedBuildingBlocks[7] = toScopedStoreAtomFn(storeState[7]) // atomRead
  scopedBuildingBlocks[8] = toScopedStoreAtomFn(storeState[8]) // atomWrite
  scopedBuildingBlocks[9] = storeState[9] // atomOnInit
  scopedBuildingBlocks[10] = toScopedStoreAtomFn(storeState[10]) // atomOnMount
  // scopedBuildingBlocks[11] = toScopedStoreAtomFn(storeState[11]) // ensureAtomState
  scopedBuildingBlocks[12] = storeState[12] // flushCallbacks
  scopedBuildingBlocks[13] = storeState[13] // recomputeInvalidatedAtoms
  // scopedBuildingBlocks[14] = toScopedStoreAtomFn(storeState[14]) // readAtomState
  scopedBuildingBlocks[15] = toScopedStoreAtomFn(storeState[15]) // invalidateDependents
  scopedBuildingBlocks[16] = toScopedStoreAtomFn(storeState[16]) // writeAtomState
  scopedBuildingBlocks[17] = toScopedStoreAtomFn(storeState[17]) // mountDependencies
  // scopedBuildingBlocks[18] = toScopedStoreAtomFn(storeState[18]) // mountAtom
  // scopedBuildingBlocks[19] = toScopedStoreAtomFn(storeState[19]) // unmountAtom
  scopedBuildingBlocks[20] = toScopedStoreAtomFn(storeState[20]) // setAtomStateValueOrPromise
  scopedBuildingBlocks[21] = scopedGet
  scopedBuildingBlocks[22] = scopedSet
  scopedBuildingBlocks[23] = scopedSub

  const scopedStore = buildStore(...scopedBuildingBlocks) as ScopedStore
  scopedStore[SCOPE] = scope
  setOriginalBuildingBlocks(scopedStore, storeState)

  scopedStore[SCOPE] = scope
  return scopedStore

  // ---------------------------------------------------------------------------------

  function scopedGet(store: Store, atom: AnyAtom) {
    const [scopedAtom] = scope.getAtom(atom)
    return storeGet(store, scopedAtom)
  }

  function scopedSet<Value, Args extends any[], Result>(
    store: Store,
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ) {
    const [scopedAtom, implicitScope] = scope.getAtom(atom)
    const restore = scope.prepareWriteAtom(
      scopedAtom,
      atom,
      implicitScope,
      scope
    )
    try {
      return storeSet(store, scopedAtom, ...args)
    } finally {
      restore?.()
    }
  }

  function scopedSub(store: Store, atom: AnyAtom, callback: () => void) {
    const [scopedAtom] = scope.getAtom(atom)
    return storeSub(store, scopedAtom, callback)
  }

  // ---------------------------------------------------------------------------------

  function toScopedStoreAtomFn<T extends AnyAtom | AnyWritableAtom>(
    fn: (store: Store, atom: T, ...args: any[]) => any
  ) {
    return (store: Store, atom: AnyAtom, ...args: any[]) => {
      const [scopedAtom] = scope.getAtom(atom)
      return fn(store, scopedAtom as T, ...args)
    }
  }

  const scopedStore = buildStore(...storeState) as ScopedStore
  // TODO: We need a way to patch the building blocks after the store is created
  // TODO: So that atomEffect and other utilities will work correctly
  // TODO: The patch ensures the correct store, atom, and atomState are used
  // TODO: By referencing the original atom as input and returning the scoped atom and state
  scopedStore[SCOPE] = scope
  setOriginalBuildingBlocks(scopedStore, storeState)

  scopedStore[SCOPE] = scope
  return scopedStore

  // ---------------------------------------------------------------------------------

  function scopedSet<Value, Args extends any[], Result>(
    store: Store,
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ) {
    const [scopedAtom, implicitScope] = scope.getAtom(atom)
    const restore = scope.prepareWriteAtom(
      scopedAtom,
      atom,
      implicitScope,
      scope
    )
    try {
      return storeSet(store, scopedAtom, ...args)
    } finally {
      restore?.()
    }
  }

  function scopeStoreFn<T extends AnyAtom | AnyWritableAtom>(
    fn: (store: Store, atom: T, ...args: any[]) => any
  ) {
    return (store: Store, atom: AnyAtom, ...args: any[]) => {
      const [scopedAtom] = scope.getAtom(atom)
      return fn(store, scopedAtom as T, ...args)
    }
  }

  function patchWeakMap<T extends WeakMapForAtoms>(wm: T): T {
    const patchedWm: any = {
      get: toScopedAtomFn(wm.get.bind(wm)),
      set: toScopedAtomFn(wm.set.bind(wm)),
    }
    if ('has' in wm) {
      patchedWm.has = toScopedAtomFn(wm.has.bind(wm))
    }
    if ('delete' in wm) {
      patchedWm.delete = toScopedAtomFn(wm.delete.bind(wm))
    }
    return patchedWm
  }

  function patchSet(s: WeakSetForAtoms) {
    return {
      get size() {
        return s.size
      },
      add: toScopedAtomFn(s.add.bind(s)),
      has: toScopedAtomFn(s.has.bind(s)),
      clear: s.clear.bind(s),
      forEach: (cb) => s.forEach(toScopedAtomFn(cb)),
      *[Symbol.iterator](): IterableIterator<AnyAtom> {
        for (const atom of s) yield scope.getAtom(atom)[0]
      },
    } as WeakSetForAtoms
  }

  function patchStoreHook(fn: StoreHookForAtoms | undefined) {
    if (!fn) {
      return undefined
    }
    const storeHook = toScopedAtomFn(fn) as typeof fn
    storeHook.add = (atom, callback) => {
      if (atom === undefined) {
        return fn.add(undefined, callback)
      }
      return fn.add(scope.getAtom(atom)[0], callback as () => void)
    }
    return storeHook
  }
}
