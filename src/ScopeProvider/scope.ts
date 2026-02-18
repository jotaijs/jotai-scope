import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_BuildingBlocks as BuildingBlocks,
  INTERNAL_EnsureAtomState as EnsureAtomState,
  INTERNAL_Mounted as Mounted,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { __DEV__ } from '../env'
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
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
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

/** @returns a patched store that intercepts atom access to apply the scope */
function createPatchedStore(scope: Scope): Store {
  const baseStore = scope[3]
  const storeState: BuildingBlocks = [...getBuildingBlocks(baseStore)]
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]
  // const atomOnInit = storeState[9]
  const alreadyPatched: StoreHooks = {}

  storeState[9] = (_, atom) => {
    // atomOnInit(scopedStore, atom)
    // FIXME: revert to the above
    // backwards compatibility for older versions of jotai
    if ((atom as any).INTERNAL_onInit) {
      ;(atom as any).INTERNAL_onInit(scopedStore)
    } else if ((atom as any).unstable_onInit) {
      ;(atom as any).unstable_onInit(scopedStore)
    }
  }
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = patchStoreFn(storeSub)
  storeState[24] = ([...buildingBlocks]) => {
    const patchedBuildingBlocks: BuildingBlocks = [
      patchWeakMap(buildingBlocks[0], patchGetAtomState), //  atomStateMap
      patchWeakMap(buildingBlocks[1], patchGetMounted), //    mountedMap
      patchWeakMap(buildingBlocks[2]), //                     invalidatedAtoms
      patchSet(buildingBlocks[3]), //                         changedAtoms
      buildingBlocks[4], //                                   mountCallbacks
      buildingBlocks[5], //                                   unmountCallbacks
      patchStoreHooks(buildingBlocks[6]), //                  storeHooks
      patchStoreFn(buildingBlocks[7]), //                     atomRead
      patchStoreFn(buildingBlocks[8]), //                     atomWrite
      buildingBlocks[9], //                                   atomOnInit
      patchStoreFn(buildingBlocks[10]), //                    atomOnMount
      patchStoreFn(
        buildingBlocks[11], //                                ensureAtomState
        (fn) => patchEnsureAtomState(patchedBuildingBlocks[0], fn)
      ),
      buildingBlocks[12], //                                  flushCallbacks
      buildingBlocks[13], //                                  recomputeInvalidatedAtoms
      patchStoreFn(buildingBlocks[14]), //                    readAtomState
      patchStoreFn(buildingBlocks[15]), //                    invalidateDependents
      patchStoreFn(buildingBlocks[16]), //                    writeAtomState
      patchStoreFn(buildingBlocks[17]), //                    mountDependencies
      patchStoreFn(buildingBlocks[18]), //                    mountAtom
      patchStoreFn(buildingBlocks[19]), //                    unmountAtom
      patchStoreFn(buildingBlocks[20]), //                    setAtomStateValueOrPromise
      patchStoreFn(buildingBlocks[21]), //                    getAtom
      patchStoreFn(buildingBlocks[22]), //                    setAtom
      patchStoreFn(buildingBlocks[23]), //                    subAtom
      () => buildingBlocks, //                                enhanceBuildingBlocks (raw)
      ...(buildingBlocks.slice(25) as never), //              rest of building blocks
    ]
    return patchedBuildingBlocks
  }
  const scopedStore = buildStore(...storeState)
  return scopedStore

  // ---------------------------------------------------------------------------------

  function patchGetAtomState<T extends BuildingBlocks[0]['get']>(fn: T) {
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
      patchedAtomState = {
        ...atomState,
        d: patchWeakMap(atomState.d, function patchGetDependency(fn) {
          return (k) => fn(getAtom(scope, k)[0])
        }),
        p: patchSet(atomState.p),
        get n() {
          return atomState.n
        },
        set n(v) {
          atomState.n = v
        },
        get v() {
          return atomState.v
        },
        set v(v) {
          atomState.v = v
        },
        get e() {
          return atomState.e
        },
        set e(v) {
          atomState.e = v
        },
      } as AtomState
      patchedASM.set(atom, patchedAtomState)
      return patchedAtomState
    } as T
  }

  function patchGetMounted<T extends BuildingBlocks[1]['get']>(fn: T) {
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
        d: patchSet(mounted.d),
        t: patchSet(mounted.t),
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

  function patchEnsureAtomState(patchedASM: AtomStateMap, fn: EnsureAtomState) {
    return function patchedEnsureAtomState(store, atom) {
      const patchedAtomState = patchedASM.get(atom)
      if (patchedAtomState) {
        return patchedAtomState
      }
      patchedASM.set(atom, fn(store, atom))
      return patchedASM.get(atom)
    } as EnsureAtomState
  }

  function scopedSet<Value, Args extends any[], Result>(
    store: Store,
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ): Result {
    const [scopedAtom, implicitScope] = getAtom(scope, atom)
    const restore = prepareWriteAtom(scope, scopedAtom, atom, implicitScope, scope)
    try {
      return storeSet(store, scopedAtom as typeof atom, ...args)
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

  function patchStoreFn<T extends (...args: any[]) => any>(fn: T, patch?: (fn: T) => T) {
    return function scopedStoreFn(store, atom, ...args) {
      const [scopedAtom] = getAtom(scope, atom)
      const f = patch ? patch(fn) : fn
      return f(store, scopedAtom, ...args)
    } as T
  }

  function patchWeakMap<T extends WeakMapLike<AnyAtom, unknown>>(wm: T, patch?: (fn: T['get']) => T['get']): T {
    const patchedWm: WeakMapLike<AnyAtom, unknown> = {
      get: patchAtomFn(wm.get.bind(wm), patch),
      set: patchAtomFn(wm.set.bind(wm)),
      has: patchAtomFn(wm.has.bind(wm)),
      delete: patchAtomFn(wm.delete.bind(wm)),
    }
    return patchedWm as T
  }

  function patchSet(s: SetLike<AnyAtom>) {
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
