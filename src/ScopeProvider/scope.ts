import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import { __DEV__ } from '../env'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_BuildingBlocks as BuildingBlocks,
  INTERNAL_EnsureAtomState as EnsureAtomState,
  INTERNAL_Mounted as Mounted,
  INTERNAL_MountedMap as MountedMap,
  INTERNAL_Store as Store,
} from '../jotai-compat'
import {
  INTERNAL_KEY_atomOnInit,
  INTERNAL_KEY_atomOnMount,
  INTERNAL_KEY_atomRead,
  INTERNAL_KEY_atomStateMap,
  INTERNAL_KEY_atomWrite,
  INTERNAL_KEY_changedAtoms,
  INTERNAL_KEY_enhanceBuildingBlocks,
  INTERNAL_KEY_ensureAtomState,
  INTERNAL_KEY_flushCallbacks,
  INTERNAL_KEY_invalidateDependents,
  INTERNAL_KEY_invalidatedAtoms,
  INTERNAL_KEY_mountAtom,
  INTERNAL_KEY_mountCallbacks,
  INTERNAL_KEY_mountDependencies,
  INTERNAL_KEY_mountedMap,
  INTERNAL_KEY_readAtomState,
  INTERNAL_KEY_recomputeInvalidatedAtoms,
  INTERNAL_KEY_setAtomStateValueOrPromise,
  INTERNAL_KEY_storeGet,
  INTERNAL_KEY_storeHooks,
  INTERNAL_KEY_storeSet,
  INTERNAL_KEY_storeSub,
  INTERNAL_KEY_unmountAtom,
  INTERNAL_KEY_unmountCallbacks,
  INTERNAL_KEY_writeAtomState,
  INTERNAL_buildStore as buildStore,
  INTERNAL_getBuildingBlocks as getBuildingBlocks,
} from '../jotai-compat'
import type {
  AnyAtom,
  AnyAtomFamily,
  AnyWritableAtom,
  AtomPairMap,
  Scope,
  SetLike,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapLike,
} from '../types'
import { isWritableAtom, toNameString } from '../utils'

/** WeakMap to store the scope associated with each scoped store */
export const storeScopeMap = new WeakMap<Store, Scope>()

const globalScopeKey: { name?: string } = {}
if (__DEV__) {
  globalScopeKey.name = 'unscoped'
  globalScopeKey.toString = toNameString
}

type GlobalScopeKey = typeof globalScopeKey

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)

export function getAtom<T>(scope: Scope, atom: Atom<T>, implicitScope?: Scope): [Atom<T>, Scope?] {
  const [explicitMap, implicitMap, inheritedSource, , parentScope] = scope

  const explicitEntry = explicitMap.get(atom)
  if (explicitEntry) {
    return explicitEntry
  }

  if (implicitScope === scope) {
    // dependencies of explicitly scoped atoms are implicitly scoped
    // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
    let implicitEntry = implicitMap.get(atom)
    if (!implicitEntry) {
      implicitEntry = [cloneAtom(scope, atom, implicitScope), implicitScope]
      implicitMap.set(atom, implicitEntry)
    }
    return implicitEntry
  }

  // inherited atoms are copied so they can access scoped atoms
  // dependencies of inherited atoms first check if they are explicitly scoped
  // otherwise they use their original scope's atom
  const source = implicitScope ?? globalScopeKey
  let inheritedMap = inheritedSource.get(source)
  if (!inheritedMap) {
    inheritedMap = new WeakMap() as AtomPairMap
    inheritedSource.set(source, inheritedMap)
  }
  let inheritedEntry = inheritedMap.get(atom)
  if (!inheritedEntry) {
    const [
      ancestorAtom,
      ancestorScope, //
    ] = parentScope ? getAtom(parentScope, atom, implicitScope) : [atom]
    const inheritedClone = atom.read === defaultRead ? ancestorAtom : cloneAtom(scope, atom, ancestorScope)
    inheritedEntry = [inheritedClone, ancestorScope]
    inheritedMap.set(atom, inheritedEntry)
  }
  return inheritedEntry
}

export function cleanup(scope: Scope): void {
  for (const cleanupFamilyListeners of scope[5]) {
    cleanupFamilyListeners()
  }
}

export function prepareWriteAtom<T extends AnyAtom>(
  scope: Scope,
  atom: T,
  originalAtom: T,
  implicitScope: Scope | undefined,
  writeScope: Scope | undefined
): (() => void) | undefined {
  if (
    originalAtom.read === defaultRead &&
    isWritableAtom(originalAtom) &&
    isWritableAtom(atom) &&
    originalAtom.write !== defaultWrite &&
    scope !== implicitScope
  ) {
    // atom is writable with init and holds a value
    // we need to preserve the value, so we don't want to copy the atom
    // instead, we need to override write until the write is finished
    const { write } = originalAtom
    atom.write = createScopedWrite(
      scope,
      originalAtom.write.bind(originalAtom) as (typeof originalAtom)['write'],
      implicitScope,
      writeScope
    )
    return () => {
      atom.write = write
    }
  }
  return undefined
}

function createScopedRead<T extends Atom<unknown>>(scope: Scope, read: T['read'], implicitScope?: Scope): T['read'] {
  return function scopedRead(get, opts) {
    return read(function scopedGet(a) {
      const [scopedAtom] = getAtom(scope, a, implicitScope)
      return get(scopedAtom)
    }, opts)
  }
}

function createScopedWrite<T extends AnyWritableAtom>(
  scope: Scope,
  write: T['write'],
  implicitScope?: Scope,
  writeScope = implicitScope
): T['write'] {
  return function scopedWrite(get, set, ...args) {
    return write(
      function scopedGet(a) {
        const [scopedAtom] = getAtom(scope, a, implicitScope)
        return get(scopedAtom)
      },
      function scopedSet(a, ...v) {
        const [scopedAtom] = getAtom(scope, a, implicitScope)
        const restore = prepareWriteAtom(scope, scopedAtom, a, implicitScope, writeScope)
        try {
          return set(scopedAtom as typeof a, ...v)
        } finally {
          restore?.()
        }
      },
      ...args
    )
  }
}

function cloneAtom<T>(scope: Scope, originalAtom: Atom<T>, implicitScope: Scope | undefined): Atom<T> {
  // avoid reading `init` to preserve lazy initialization
  const propDesc = Object.getOwnPropertyDescriptors(originalAtom)
  Object.keys(propDesc)
    .filter((k) => ['read', 'write', 'debugLabel'].includes(k))
    .forEach((k) => (propDesc[k].configurable = true))
  const atomProto = Object.getPrototypeOf(originalAtom)
  const scopedAtom: Atom<T> = Object.create(atomProto, propDesc)

  if (scopedAtom.read !== defaultRead) {
    scopedAtom.read = createScopedRead<typeof scopedAtom>(scope, originalAtom.read.bind(originalAtom), implicitScope)
  }

  if (isWritableAtom(scopedAtom) && isWritableAtom(originalAtom) && scopedAtom.write !== defaultWrite) {
    scopedAtom.write = createScopedWrite(scope, originalAtom.write.bind(originalAtom), implicitScope)
  }
  if (__DEV__) {
    Object.defineProperty(scopedAtom, 'debugLabel', {
      get() {
        return `${originalAtom.debugLabel}@${scope.name}`
      },
      configurable: true,
      enumerable: true,
    })
  }

  return scopedAtom
}

type CreateScopeProps = {
  atoms?: Iterable<AnyAtom>
  atomFamilies?: Iterable<AnyAtomFamily>
  parentStore: Store
  name?: string
}

export function createScope({ atoms = [], atomFamilies = [], parentStore, name: scopeName }: CreateScopeProps): Store {
  const atomsSet = new WeakSet(atoms)
  const parentScope = storeScopeMap.get(parentStore)
  const baseStore = parentScope?.[3] ?? parentStore

  // Create the scope as an array with data fields
  const scope: Scope = [
    new WeakMap(),
    new WeakMap() as AtomPairMap,
    new WeakMap<Scope | GlobalScopeKey, AtomPairMap>(),
    baseStore,
    parentScope,
    new Set<() => void>(),
    undefined!, // Store - will be set after creating patched store
  ] as Scope
  const explicitMap = scope[0]
  const cleanupFamiliesSet = scope[5]

  const scopedStore = createPatchedStore(scope)
  scope[6] = scopedStore
  Object.assign(scopedStore, { name: scopeName })
  storeScopeMap.set(scopedStore, scope)

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of new Set(atoms)) {
    explicitMap.set(atom, [cloneAtom(scope, atom, scope), scope])
  }

  for (const atomFamily of new Set(atomFamilies)) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtom(scope, atom, scope), scope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }: { type: 'CREATE' | 'REMOVE'; atom: AnyAtom }) => {
      if (type === 'CREATE' && !explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtom(scope, atom, scope), scope])
      } else if (type === 'REMOVE' && !atomsSet.has(atom)) {
        explicitMap.delete(atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }

  return scopedStore
}

function cloneBuildingBlocks(buildingBlocks: BuildingBlocks): BuildingBlocks {
  return (Array.isArray(buildingBlocks) ? [...buildingBlocks] : { ...buildingBlocks }) as unknown as BuildingBlocks
}

/** @returns a patched store that intercepts atom access to apply the scope */
function createPatchedStore(scope: Scope): Store {
  const baseStore = scope[3]
  const storeState = cloneBuildingBlocks(getBuildingBlocks(baseStore))
  const state = storeState as Record<PropertyKey, any>
  const storeGet = state[INTERNAL_KEY_storeGet]
  const storeSet = state[INTERNAL_KEY_storeSet]
  const storeSub = state[INTERNAL_KEY_storeSub]
  const alreadyPatched: StoreHooks = {}
  state[INTERNAL_KEY_storeGet] = patchStoreFn(storeGet)
  state[INTERNAL_KEY_storeSet] = scopedSet
  state[INTERNAL_KEY_storeSub] = patchStoreFn(storeSub)
  let patchedAtomStateMap: AtomStateMap | undefined
  let out: BuildingBlocks | undefined
  storeState[INTERNAL_KEY_enhanceBuildingBlocks] = function enhanceScopedBuildingBlocks(source) {
    patchedAtomStateMap ??= patchWeakMapLike(source[INTERNAL_KEY_atomStateMap] as AtomStateMap, patchGetAtomState)
    out ??= Object.assign(cloneBuildingBlocks(source), {
      ...source,
      [INTERNAL_KEY_atomStateMap]: patchedAtomStateMap,
      [INTERNAL_KEY_mountedMap]: patchWeakMapLike(source[INTERNAL_KEY_mountedMap], patchGetMounted),
      [INTERNAL_KEY_invalidatedAtoms]: patchWeakMapLike(source[INTERNAL_KEY_invalidatedAtoms]),
      [INTERNAL_KEY_changedAtoms]: patchSetLike(source[INTERNAL_KEY_changedAtoms]),
      [INTERNAL_KEY_mountCallbacks]: source[INTERNAL_KEY_mountCallbacks],
      [INTERNAL_KEY_unmountCallbacks]: source[INTERNAL_KEY_unmountCallbacks],
      [INTERNAL_KEY_storeHooks]: patchStoreHooks(source[INTERNAL_KEY_storeHooks]),
      [INTERNAL_KEY_atomRead]: patchStoreFn(source[INTERNAL_KEY_atomRead]),
      [INTERNAL_KEY_atomWrite]: patchStoreFn(source[INTERNAL_KEY_atomWrite]),
      [INTERNAL_KEY_atomOnInit]: patchStoreFn(source[INTERNAL_KEY_atomOnInit]),
      [INTERNAL_KEY_atomOnMount]: patchStoreFn(source[INTERNAL_KEY_atomOnMount]),
      [INTERNAL_KEY_ensureAtomState]: patchEnsureAtomState(patchedAtomStateMap, source[INTERNAL_KEY_ensureAtomState]),
      [INTERNAL_KEY_flushCallbacks]: (_, ...args) => source[INTERNAL_KEY_flushCallbacks](storeState, ...args),
      [INTERNAL_KEY_recomputeInvalidatedAtoms]: (_, ...args) =>
        source[INTERNAL_KEY_recomputeInvalidatedAtoms](storeState, ...args),
      [INTERNAL_KEY_readAtomState]: patchStoreFn(source[INTERNAL_KEY_readAtomState]),
      [INTERNAL_KEY_invalidateDependents]: patchStoreFn(source[INTERNAL_KEY_invalidateDependents]),
      [INTERNAL_KEY_writeAtomState]: patchStoreFn(source[INTERNAL_KEY_writeAtomState]),
      [INTERNAL_KEY_mountDependencies]: patchStoreFn(source[INTERNAL_KEY_mountDependencies]),
      [INTERNAL_KEY_mountAtom]: patchStoreFn(source[INTERNAL_KEY_mountAtom]),
      [INTERNAL_KEY_unmountAtom]: patchStoreFn(source[INTERNAL_KEY_unmountAtom]),
      [INTERNAL_KEY_setAtomStateValueOrPromise]: patchStoreFn(source[INTERNAL_KEY_setAtomStateValueOrPromise]),
      [INTERNAL_KEY_storeGet]: patchStoreFn(source[INTERNAL_KEY_storeGet]),
      [INTERNAL_KEY_storeSet]: patchStoreFn(source[INTERNAL_KEY_storeSet]),
      [INTERNAL_KEY_storeSub]: patchStoreFn(source[INTERNAL_KEY_storeSub]),
      [INTERNAL_KEY_enhanceBuildingBlocks]: () => source,
    } satisfies BuildingBlocks)
    return out
  }
  const scopedStore = buildStore(storeState)
  return scopedStore

  // ---------------------------------------------------------------------------------

  function patchGetAtomState<T extends AtomStateMap['get']>(fn: T) {
    const patchedASM = new WeakMap<AnyAtom, AtomState>()
    return function patchedGetAtomState(atom) {
      let patchedAtomState = patchedASM.get(atom)
      if (patchedAtomState) {
        return patchedAtomState
      }
      const atomState = fn(atom)
      if (!atomState) {
        return undefined
      }
      let patchedD: AtomState['d'] | undefined
      let patchedP: AtomState['p'] | undefined
      patchedAtomState = new Proxy(atomState, {
        get(_target, prop) {
          if (prop === 'd') {
            return (patchedD ??= patchWeakMapLike(atomState.d, function patchGetDependency(fn) {
              return (k) => fn(getAtom(scope, k)[0])
            }) as AtomState['d'])
          }
          if (prop === 'p') {
            return (patchedP ??= patchSetLike(atomState.p) as AtomState['p'])
          }
          return Reflect.get(atomState, prop) as never
        },
      }) as AtomState
      patchedASM.set(atom, patchedAtomState)
      return patchedAtomState
    } as T
  }

  function patchGetMounted<T extends MountedMap['get']>(fn: T) {
    const patchedMM = new WeakMap<AnyAtom, Mounted>()
    return function patchedGetMounted(atom: AnyAtom) {
      let patchedMounted = patchedMM.get(atom)
      if (patchedMounted) {
        return patchedMounted
      }
      const mounted = fn(atom)
      if (!mounted) {
        return undefined
      }
      patchedMounted = {
        ...mounted,
        d: patchSetLike(mounted.d),
        t: patchSetLike(mounted.t),
        get u() {
          return mounted.u
        },
        set u(v) {
          mounted.u = v
        },
      } as Mounted
      patchedMM.set(atom, patchedMounted)
      return patchedMounted
    } as T
  }

  function patchEnsureAtomState(patchedASM: AtomStateMap, ensureAtomState: EnsureAtomState) {
    const patchedEnsureAtomState = patchStoreFn(ensureAtomState)
    return function ensureAtomStateWrapper(buildingBlocks, store, atom) {
      const patchedAtomState = patchedASM.get(atom)
      if (patchedAtomState) {
        return patchedAtomState
      }
      const atomState = patchedEnsureAtomState(buildingBlocks, store, atom)
      patchedASM.set(atom, atomState)
      return patchedASM.get(atom)
    } as EnsureAtomState
  }

  function scopedSet<Value, Args extends any[], Result>(
    buildingBlocks: Readonly<BuildingBlocks>,
    store: Store,
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ): Result {
    const [scopedAtom, implicitScope] = getAtom(scope, atom)
    const restore = prepareWriteAtom(scope, scopedAtom, atom, implicitScope, scope)
    try {
      return storeSet(buildingBlocks, store, scopedAtom as typeof atom, ...args)
    } finally {
      restore?.()
    }
  }

  function patchAtomFn<T extends (...args: any[]) => any>(fn: T, patch?: (fn: T) => T) {
    return function scopedAtomFn(atom, ...args) {
      const [scopedAtom] = getAtom(scope, atom)
      const f = patch ? patch(fn) : fn
      return f(scopedAtom, ...args)
    } as T
  }

  function patchStoreFn<T extends (...args: any[]) => any>(fn: T) {
    return function scopedStoreFn(
      _buildingBlocks: Readonly<BuildingBlocks>,
      store: Store,
      atom: AnyAtom,
      ...args: any[]
    ) {
      const [scopedAtom] = getAtom(scope, atom)
      return fn(storeState, store, scopedAtom, ...args)
    } as T
  }

  function patchWeakMapLike<T extends WeakMapLike<AnyAtom, unknown>>(wm: T, patch?: (fn: T['get']) => T['get']): T {
    const patchedWm: WeakMapLike<AnyAtom, unknown> = {
      get: patchAtomFn(wm.get.bind(wm), patch),
      set: patchAtomFn(wm.set.bind(wm)),
      has: patchAtomFn(wm.has.bind(wm)),
      delete: patchAtomFn(wm.delete.bind(wm)),
    }
    if (typeof (wm as unknown as Map<AnyAtom, unknown>).keys === 'function') {
      const map = wm as unknown as Map<AnyAtom, unknown>
      const wmExt = patchedWm as WeakMapLike<AnyAtom, unknown> & {
        keys: () => IterableIterator<AnyAtom>
        [Symbol.iterator]: () => IterableIterator<[AnyAtom, unknown]>
      }
      wmExt.keys = map.keys.bind(map)
      wmExt[Symbol.iterator] = map[Symbol.iterator].bind(map)
      Object.defineProperty(patchedWm, 'size', {
        enumerable: false,
        configurable: true,
        get: () => map.size,
      })
    }
    return patchedWm as T
  }

  function patchSetLike(s: SetLike<AnyAtom>) {
    return {
      get size() {
        return s.size
      },
      add: patchAtomFn(s.add.bind(s)),
      has: patchAtomFn(s.has.bind(s)),
      delete: patchAtomFn(s.delete.bind(s)),
      clear: s.clear.bind(s),
      forEach: (cb) => s.forEach(patchAtomFn(cb)),
      *[Symbol.iterator](): IterableIterator<AnyAtom> {
        for (const atom of s) yield getAtom(scope, atom)[0]
      },
    } satisfies SetLike<AnyAtom>
  }

  function patchStoreHook(fn: StoreHookForAtoms | undefined) {
    if (!fn) {
      return undefined
    }
    const storeHook = patchAtomFn(fn)
    storeHook.add = function patchAdd(atom, callback) {
      if (atom === undefined) {
        return fn.add(undefined, callback)
      }
      const [scopedAtom] = getAtom(scope, atom)
      return fn.add(scopedAtom, callback as () => void)
    }
    return storeHook
  }

  function patchStoreHooks(storeHooks: StoreHooks) {
    const patchedStoreHooks: StoreHooks = {
      get f() {
        return storeHooks.f
      },
      set f(v) {
        storeHooks.f = v
      },
    }
    Object.defineProperties(
      patchedStoreHooks,
      Object.fromEntries(
        (['r', 'c', 'm', 'u'] as const).map((hook) => [
          hook,
          {
            get() {
              return (alreadyPatched[hook] ??= patchStoreHook(storeHooks[hook]))
            },
            set(value: StoreHookForAtoms | undefined) {
              delete alreadyPatched[hook]
              storeHooks[hook] = value
            },
            configurable: true,
            enumerable: true,
          },
        ])
      )
    )
    return Object.assign(patchedStoreHooks, storeHooks)
  }
}
