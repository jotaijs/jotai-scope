import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_BuildingBlocks as BuildingBlocks,
  INTERNAL_StoreHooks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { __DEV__ } from '../env'
import type {
  AnyAtom,
  AnyAtomFamily,
  AnyWritableAtom,
  Scope,
  ScopedStore,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapForAtoms,
  WeakSetForAtoms,
  WithOriginal,
} from '../types'
import { storeScopeMap } from '../types'
import { isWritableAtom, toNameString } from '../utils'

const globalScopeKey: { name?: string } = {}
if (__DEV__) {
  globalScopeKey.name = 'unscoped'
  globalScopeKey.toString = toNameString
}

type GlobalScopeKey = typeof globalScopeKey

export function scope({
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
  // Get parent scope from WeakMap if it exists
  const parentScope = storeScopeMap.get(parentStore)
  // Get the base store - either from parent scope or use parentStore as base
  const baseStore = parentScope?.baseStore ?? parentStore

  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>()

  const currentScope: Scope = {
    getAtom,
    baseStore,
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

  const scopedStore = createPatchedStore(currentScope)
  // Store the scope in the WeakMap
  storeScopeMap.set(scopedStore, currentScope)
  return scopedStore
}

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)

// TODO: This works for everything but effect
/** @returns a patched store that intercepts get and set calls to apply the scope */
function createPatchedStore2(scope: Scope): ScopedStore {
  const buildingBlocks: BuildingBlocks = [...getBuildingBlocks(scope.baseStore)]
  const storeGet = buildingBlocks[21]
  const storeSet = buildingBlocks[22]
  const storeSub = buildingBlocks[23]

  const internalStoreHooks = {} as StoreHooks
  buildingBlocks[6] = internalStoreHooks
  buildingBlocks[21] = scopeStoreFn(storeGet)
  buildingBlocks[22] = scopedSet
  buildingBlocks[23] = scopeStoreFn(storeSub)
  buildingBlocks[24] = ([...buildingBlocks]) => {
    return buildingBlocks
  }

  const scopedStore = buildStore(...buildingBlocks) as ScopedStore
  // TODO: We need a way to patch the building blocks after the store is created
  // TODO: So that atomEffect and other utilities will work correctly
  // TODO: The patch ensures the correct store, atom, and atomState are used
  // TODO: By referencing the original atom as input and returning the scoped atom and state
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

  function scopeStoreFn<T extends (...args: any[]) => any>(fn: T): T {
    return ((store, atom, ...args) => {
      const [scopedAtom] = scope.getAtom(atom)
      return fn(store, scopedAtom, ...args)
    }) as T
  }
}

// TODO: This should work for effect but doesn't work for other tests
/** @returns a patched store that intercepts get and set calls to apply the scope */
function createPatchedStore(scope: Scope): ScopedStore {
  const storeState: BuildingBlocks = [...getBuildingBlocks(scope.baseStore)]
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]

  storeState[9] = (_: Store, atom: AnyAtom) =>
    atom.unstable_onInit?.(scopedStore)
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = patchStoreFn(storeSub)
  storeState[24] = ([...buildingBlocks]) => [
    patchWeakMap(buildingBlocks[0]), // atomStateMap
    patchWeakMap(buildingBlocks[1]), // mountedMap
    patchWeakMap(buildingBlocks[2]), // invalidatedAtoms
    patchSet(buildingBlocks[3]), // changedAtoms
    buildingBlocks[4], // mountCallbacks
    buildingBlocks[5], // unmountCallbacks
    patchStoreHooks(buildingBlocks[6]), // storeHooks
    patchStoreFn(buildingBlocks[7]), // atomRead
    patchStoreFn(buildingBlocks[8]), // atomWrite
    buildingBlocks[9], // atomOnInit
    patchStoreFn(buildingBlocks[10]), // atomOnMount
    patchStoreFn(buildingBlocks[11]), // ensureAtomState
    buildingBlocks[12], // flushCallbacks
    buildingBlocks[13], // recomputeInvalidatedAtoms
    patchStoreFn(buildingBlocks[14]), // readAtomState
    patchStoreFn(buildingBlocks[15]), // invalidateDependents
    patchStoreFn(buildingBlocks[16]), // writeAtomState
    patchStoreFn(buildingBlocks[17]), // mountDependencies
    patchStoreFn(buildingBlocks[18]), // mountAtom
    patchStoreFn(buildingBlocks[19]), // unmountAtom
    patchStoreFn(buildingBlocks[20]), // setAtomStateValueOrPromise
    patchStoreFn(buildingBlocks[21]), // getAtom
    patchStoreFn(buildingBlocks[22]), // setAtom
    patchStoreFn(buildingBlocks[23]), // subAtom
    undefined, // enhanceBuildingBlocks
  ]
  const scopedStore = buildStore(...storeState) as ScopedStore
  return scopedStore

  // ---------------------------------------------------------------------------------

  function patchStoreHooks(storeHooks: INTERNAL_StoreHooks) {
    const internalStoreHooks: Partial<StoreHooks> = {}
    const patchedStoreHooks = {
      get r() {
        return internalStoreHooks.r
      },
      set r(v) {
        internalStoreHooks.r = patchStoreHook(v)
      },
      get c() {
        return internalStoreHooks.c
      },
      set c(v) {
        internalStoreHooks.c = patchStoreHook(v)
      },
      get m() {
        return internalStoreHooks.m
      },
      set m(v) {
        internalStoreHooks.m = patchStoreHook(v)
      },
      get u() {
        return internalStoreHooks.u
      },
      set u(v) {
        internalStoreHooks.u = patchStoreHook(v)
      },
      get f() {
        return internalStoreHooks.f
      },
      set f(v) {
        internalStoreHooks.f = v
      },
    }
    Object.assign(patchedStoreHooks, storeHooks)
    return patchedStoreHooks
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

  function patchAtomFn<T extends AnyAtom | AnyWritableAtom>(
    fn: (atom: T, ...args: any[]) => any
  ) {
    return function scopedAtomFn(atom: AnyAtom, ...args: any[]) {
      const [scopedAtom] = scope.getAtom(atom)
      return fn(scopedAtom as T, ...args)
    }
  }

  function patchStoreFn<T extends (...args: any[]) => any>(fn: T) {
    return function scopedStoreFn(store, atom, ...args) {
      const [scopedAtom] = scope.getAtom(atom)
      return fn(store, scopedAtom, ...args)
    } as T
  }

  function patchWeakMap<T extends WeakMapForAtoms>(wm: T): T {
    const patchedWm: any = {
      get: patchAtomFn(wm.get.bind(wm)),
      set: patchAtomFn(wm.set.bind(wm)),
    }
    if ('has' in wm) {
      patchedWm.has = patchAtomFn(wm.has.bind(wm))
    }
    if ('delete' in wm) {
      patchedWm.delete = patchAtomFn(wm.delete.bind(wm))
    }
    return patchedWm
  }

  function patchSet(s: WeakSetForAtoms) {
    return {
      get size() {
        return s.size
      },
      add: patchAtomFn(s.add.bind(s)),
      has: patchAtomFn(s.has.bind(s)),
      clear: s.clear.bind(s),
      forEach: (cb) => s.forEach(patchAtomFn(cb)),
      *[Symbol.iterator](): IterableIterator<AnyAtom> {
        for (const atom of s) yield scope.getAtom(atom)[0]
      },
    } as WeakSetForAtoms
  }

  function patchStoreHook(fn: StoreHookForAtoms | undefined) {
    if (!fn) {
      return undefined
    }
    const storeHook = patchAtomFn(fn) as typeof fn
    storeHook.add = (atom, callback) => {
      if (atom === undefined) {
        return fn.add(undefined, callback)
      }
      return fn.add(scope.getAtom(atom)[0], callback as () => void)
    }
    return storeHook
  }
}
