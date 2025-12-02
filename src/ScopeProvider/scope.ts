import type { Atom, Getter, Setter, WritableAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
  INTERNAL_isAtomStateInitialized as isAtomStateInitialized,
  INTERNAL_returnAtomValue as returnAtomValue,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_AtomRead as AtomRead,
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_AtomWrite as AtomWrite,
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
  StoreHookForAtoms,
  StoreHooks,
  WeakMapForAtoms,
  WeakSetForAtoms,
} from '../types'
import { isCustomWrite, isDerived, isWritableAtom, toNameString } from '../utils'
import chalk from 'chalk'

/** WeakMap to store the scope associated with each scoped store */
export const storeScopeMap = new WeakMap<Store, Scope>()

const globalScopeKey: { name?: string } = {}
if (__DEV__) {
  globalScopeKey.name = 'unscoped'
  globalScopeKey.toString = toNameString
}

type GlobalScopeKey = typeof globalScopeKey

// ---------------------------------------------------------------------------------
// Pure functions operating on Scope
// ---------------------------------------------------------------------------------

/** @returns a scoped copy of the atom */
function cloneAtom<T>(scope: Scope, originalAtom: Atom<T>, implicitScope: Scope | undefined): Atom<T> {
  // TODO: Delete these checks
  // avoid reading `init` to preserve lazy initialization
  const propDesc = Object.getOwnPropertyDescriptors(originalAtom)
  Object.keys(propDesc)
    .filter((k) => ['read', 'write', 'debugLabel'].includes(k))
    .forEach((k) => (propDesc[k].configurable = true))
  const atomProto = Object.getPrototypeOf(originalAtom)
  const scopedAtom: Atom<T> = Object.create(atomProto, propDesc)

  if (isDerived(scopedAtom)) {
    scopedAtom.read = createScopedRead<typeof scopedAtom>(scope, originalAtom.read.bind(originalAtom), implicitScope)
  }

  if (isWritableAtom(scopedAtom) && isWritableAtom(originalAtom) && isCustomWrite(scopedAtom)) {
    scopedAtom.write = createScopedWrite(scope, originalAtom.write.bind(originalAtom), implicitScope)
  }
  if (__DEV__) {
    Object.defineProperty(scopedAtom, 'debugLabel', {
      get() {
        return `${originalAtom.debugLabel}${scope.name?.replace('S', '')}`
      },
      configurable: true,
      enumerable: true,
    })
  }

  return scopedAtom
}

/**
 * Creates a multi-stable atom that can transition between unscoped and scoped states.
 * It is effectively one of two atoms depending on its dependencies.
 * @returns a multi-stable atom
 */
function createMultiStableAtom<T>(scope: Scope, originalAtom: Atom<T>, implicitScope: Scope | undefined): Atom<T> {
  // TODO: Delete these checks
  if (originalAtom.debugLabel?.endsWith('_')) {
    throw new Error('Cannot clone proxy atom')
  }
  if (originalAtom.debugLabel?.includes('@')) {
    throw new Error('Cannot clone already scoped atom')
  }
  const explicitMap = scope[0]
  const scopedAtom = cloneAtom(scope, originalAtom, implicitScope)
  explicitMap.set(scopedAtom, [scopedAtom, scope])

  const dependentMap = scope[2]
  const baseStore = scope[4]
  const scopedStore = scope[7]

  const buildingBlocks = getBuildingBlocks(baseStore)
  const atomStateMap = buildingBlocks[0]
  const mountedMap = buildingBlocks[1]
  const changedAtoms = buildingBlocks[3]
  const storeHooks = initializeStoreHooks(buildingBlocks[6])
  const atomRead = buildingBlocks[7]
  const atomWrite = buildingBlocks[8]
  const ensureAtomState = buildingBlocks[11]
  const readAtomState = buildingBlocks[14]
  const writeAtomState = buildingBlocks[16]
  const mountAtom = buildingBlocks[18]
  const unmountAtom = buildingBlocks[19]

  const proxyStore = buildStore(
    ...(Object.assign([...buildingBlocks], {
      /** reads as originalAtom when unscoped, scopedAtom when scoped */
      7: function scopedAtomRead(store, toAtom, getter, options) {
        const getter2 = proxyState.isScoped ? createScopedGet(scope, getter, implicitScope) : getter
        return atomRead(store, toAtom, getter2, options)
      } as AtomRead,
      /** writes to originalAtom when unscoped, scopedAtom when scoped */
      8: function scopedAtomWrite(store, toAtom, getter, setter, ...args) {
        const getter2 = proxyState.isScoped ? createScopedGet(scope, getter, implicitScope) : getter
        const setter2 = proxyState.isScoped ? createScopedSet(scope, setter, implicitScope) : setter
        return atomWrite(store, toAtom, getter2, setter2, ...args)
      } as AtomWrite,
    }) as Partial<BuildingBlocks>)
  )

  // This atom can either be the unscoped originalAtom or the scopedAtom depending on its dependencies.
  // It calls the originalAtom's read function as needed.
  const proxyAtom = {
    read: function proxyRead() {
      const classA = processScopeClassification()
      let atomState = readAtomState(proxyStore, proxyState.toAtom)
      // const classB = processScopeClassification()
      // if (classA !== classB) {
      //   atomState = readAtomState(proxyStore, proxyState.toAtom)
      // }
      // Sync proxyAtom in deps' mounted.t after each read
      return returnAtomValue(atomState)
    },
    ...(isWritableAtom(originalAtom)
      ? {
          write: function proxyWrite(_get, _set, ...args) {
            return writeAtomState(proxyStore, proxyState.toAtom as AnyWritableAtom, ...args)
          } as (typeof originalAtom)['write'],
        }
      : {}),
  } as Atom<T>

  function getIsDependentScoped(): boolean {
    // Always re-read originalAtom to get current dependencies
    const toAtomState = ensureAtomState(proxyState.store, proxyState.toAtom)
    if (!isAtomStateInitialized(toAtomState)) {
      readAtomState(baseStore, proxyState.toAtom)
    }
    const dependencies = Array.from(toAtomState.d.keys())
    // if there are scoped dependencies, it is scoped
    if (dependencies.some((a) => isExplictOrDependentScoped(scope, a))) {
      return true
    }
    const originalAtomState = ensureAtomState(baseStore, originalAtom)
    if (!isAtomStateInitialized(originalAtomState)) {
      readAtomState(baseStore, originalAtom)
    }
    // if dependencies are the same, it is unscoped
    if (dependencies.length === originalAtomState!.d.size && dependencies.every((a) => originalAtomState!.d.has(a))) {
      return false
    }
    return true
  }

  const proxyState = {
    prevDeps: new Set<AnyAtom>(),
    /** true if proxyAtom is dependent scoped (depends on explicit or dependent scoped atoms) */
    get isScoped() {
      return dependentMap.has(proxyAtom)
    },
    set isScoped(v: boolean) {
      if (v) {
        dependentMap.set(proxyAtom, [proxyAtom, scope])
      } else {
        dependentMap.delete(proxyAtom)
      }
      changeClassification(v)
    },
    toAtom: originalAtom,
    fromAtom: scopedAtom,
    store: baseStore,
    isInitialized: false,
  }

  function changeClassification(isScoped: boolean) {
    if (isScoped) {
      proxyState.fromAtom = originalAtom
      proxyState.toAtom = scopedAtom
      proxyState.store = scopedStore
    } else {
      proxyState.fromAtom = scopedAtom
      proxyState.toAtom = originalAtom
      proxyState.store = baseStore
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Hook-based Mounting
  // ─────────────────────────────────────────────────────────────────────────────

  let cleanupToAtomHooks: (() => void) | undefined

  /**
   * Sets up hooks on the toAtom (c0 or c1) to track when it mounts/unmounts.
   * This allows the proxy to know when the underlying atom is mounted.
   */
  function setupToAtomHooks(toAtom: AnyAtom): void {
    cleanupToAtomHooks?.()
    const cleanup = [
      storeHooks.m.add(toAtom, function onAtomMountStoreHook() {
        // When toAtom mounts, ensure proxyAtom is also mounted
        mountedMap.set(proxyAtom, mountedMap.get(toAtom)!)
        storeHooks.m(proxyAtom)
      }),

      storeHooks.u.add(toAtom, function onAtomUnmountStoreHook() {
        // When toAtom unmounts, proxyAtom should also unmount
        mountedMap.delete(proxyAtom)
        storeHooks.u(proxyAtom)
      }),

      // When toAtom is read/recomputed, check classification and sync deps
      storeHooks.r?.add(toAtom, function onAtomReadStoreHook() {
        const prevIsScoped = proxyState.isScoped
        const isScoped = processScopeClassification()
        // if (prevIsScoped !== isScoped) {
        //   console.log(chalk.bold.rgb(255, 165, 0)('toAtom read recomputed classification change', toAtom.debugLabel))
        // }
        storeHooks.r(proxyAtom)
      }),

      storeHooks.c?.add(toAtom, function onAtomChangedStoreHook() {
        // changedAtoms.add(proxyAtom)
        // storeHooks.c(proxyAtom)
      }),
    ]

    const cleanupListeners = scope[6]
    cleanupToAtomHooks = () => {
      cleanup.forEach((cleanup) => cleanup())
      cleanupListeners.delete(cleanupToAtomHooks!)
    }
    cleanupListeners.add(cleanupToAtomHooks)
  }

  /**
   * Moves listeners from fromAtom to toAtom when classification changes.
   * Listeners subscribed in the current scope move with the classification.
   */
  function transferListeners(fromAtom: AnyAtom, toAtom: AnyAtom): void {
    const fromMounted = mountedMap.get(fromAtom)
    if (!fromMounted) return

    // Get listeners that were subscribed in this scope
    const scopeListeners = collectListeners(scope, toAtom, originalAtom)
    if (scopeListeners.size === 0) return

    // Ensure toAtom is mounted since listeners exist
    ensureAtomState(proxyState.store, toAtom)
    const toMounted = mountAtom(proxyState.store, toAtom)

    // Move listeners from fromMounted to toMounted
    for (const listener of scopeListeners) {
      fromMounted.l.delete(listener)
      toMounted.l.add(listener)
    }

    // If fromAtom has no more listeners, unmount it
    if (fromMounted.l.size === 0) {
      const fromAtomState = atomStateMap.get(fromAtom)
      if (fromAtomState) {
        for (const a of fromMounted.d) {
          const aMounted = mountedMap.get(a)
          if (aMounted) {
            aMounted.t.delete(fromAtom)
          }
        }
        unmountAtom(proxyState.store, fromAtom)
      }
    }
  }

  /**
   * Checks if atomState dependencies are either dependent or explicit in current scope
   * and processes classification change.
   * @returns {boolean} isScoped
   *   1. atomState dependencies are either dependent or explicit in current scope
   *   2. atomState dependencies are different from originalAtomState dependencies
   */
  function processScopeClassification(): boolean {
    const isScoped = getIsDependentScoped()
    const scopeChanged = isScoped !== proxyState.isScoped
    proxyState.isScoped = isScoped
    const isInitialized = proxyState.isInitialized

    // if there is a scope change, or proxyAtom is not yet initialized, process classification change
    if (scopeChanged || !proxyState.isInitialized) {
      // Alias proxyAtom's atomState to toAtom's atomState
      const toAtomState = ensureAtomState(proxyState.store, proxyState.toAtom)
      atomStateMap.set(proxyAtom, toAtomState)
      // Transfer listeners when classification changes
      transferListeners(proxyState.fromAtom, proxyState.toAtom)
      const toMounted = mountedMap.get(proxyState.toAtom)
      // If toAtom is mounted, proxyAtom is mounted with the same mounted instance
      if (toMounted) {
        mountedMap.set(proxyAtom, toMounted)
        storeHooks.m(proxyAtom)
      } else {
        mountedMap.delete(proxyAtom)
        storeHooks.u(proxyAtom)
      }
      setupToAtomHooks(proxyState.toAtom)
      changedAtoms.add(proxyAtom)
    }
    if (!isInitialized) {
      proxyState.isInitialized = true
      storeHooks.i(proxyAtom)
    }
    return isScoped
  }
  if (__DEV__) {
    Object.defineProperty(proxyAtom, 'debugLabel', {
      get() {
        return `${originalAtom.debugLabel ?? String(originalAtom)}_${scope.name?.replace('S', '')}->${proxyState.toAtom.debugLabel}`
      },
      configurable: true,
      enumerable: true,
    })
  }
  processScopeClassification()

  return proxyAtom
}

function getAtom<T>(scope: Scope, atom: Atom<T>, implicitScope?: Scope | undefined): [Atom<T>, Scope?] {
  const explicitMap = scope[0]
  const implicitMap = scope[1]
  const dependentMap = scope[2]
  const inheritedSource = scope[3]
  const parentScope = scope[5]
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

  const dependentEntry = dependentMap.get(atom)
  if (dependentEntry) {
    return dependentEntry
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
    const inheritedClone = isDerived(atom) ? createMultiStableAtom(scope, atom, ancestorScope) : ancestorAtom
    inheritedEntry = [inheritedClone, ancestorScope]
    inheritedMap.set(atom, inheritedEntry)
  }
  return inheritedEntry
}

export function cleanup(scope: Scope): void {
  for (const cleanupListeners of scope[6]) {
    cleanupListeners()
  }
}

function prepareWriteAtom<T extends AnyAtom>(
  scope: Scope,
  atom: T,
  originalAtom: T,
  implicitScope: Scope | undefined,
  writeScope: Scope | undefined
): (() => void) | undefined {
  if (
    !isDerived(originalAtom) &&
    isWritableAtom(originalAtom) &&
    isWritableAtom(atom) &&
    isCustomWrite(originalAtom) &&
    scope !== implicitScope
  ) {
    // atom is writable with init and holds a value
    // we need to preserve the value, so we don't want to copy the atom
    // instead, we need to override write until the write is finished
    const { write } = originalAtom
    atom.write = createScopedWrite(scope, originalAtom.write.bind(originalAtom), implicitScope, writeScope)
    const cleanupScopedWrite = () => {
      atom.write = write
      const cleanupListeners = scope[6]
      cleanupListeners.delete(cleanupScopedWrite)
    }
    const cleanupListeners = scope[6]
    cleanupListeners.add(cleanupScopedWrite)
    return cleanupScopedWrite
  }
  return undefined
}

/** Collects all listeners subscribed from the current scope to the ancestor scope where the atom is defined. */
function collectListeners(scope: Scope, toAtom: AnyAtom, originalAtom: AnyAtom): Set<() => void> {
  const listeners = new Set<() => void>()
  const atomScope = getExplicitOrDependentAtomScope(scope, toAtom)

  function gatherListeners(scope: Scope): void {
    const scopeListenersMap = scope[8]
    const listenerSet = scopeListenersMap.get(originalAtom)
    if (listenerSet) {
      for (const listener of listenerSet) {
        listeners.add(listener)
      }
    }
  }
  let currentScope: Scope | undefined = scope
  do {
    gatherListeners(currentScope)
    const parentScope: Scope | undefined = currentScope[5]
    currentScope = parentScope
  } while (currentScope && atomScope !== currentScope)
  return listeners
}

/** Returns the scope where the atom is defined. */
function getExplicitOrDependentAtomScope(scope: Scope, atom: AnyAtom): Scope | undefined {
  const explicitMap = scope[0]
  const dependentMap = scope[2]
  const parentScope = scope[5]
  if (explicitMap.has(atom)) {
    return scope
  }
  if (dependentMap.has(atom)) {
    return scope
  }
  if (parentScope) {
    return getExplicitOrDependentAtomScope(parentScope, atom)
  }
  return undefined
}

/** Returns true if the atom is defined in the scope or any of its parent scopes. */
function isExplictOrDependentScoped(scope: Scope, atom: AnyAtom): boolean {
  return getExplicitOrDependentAtomScope(scope, atom) !== undefined
}

function createScopedGet(scope: Scope, get: Getter, implicitScope?: Scope): Getter {
  return (a) => {
    const [scopedAtom] = getAtom(scope, a, implicitScope)
    return get(scopedAtom)
  }
}

function createScopedSet(scope: Scope, set: Setter, implicitScope?: Scope, writeScope = implicitScope): Setter {
  return (a, ...v) => {
    const [scopedAtom] = getAtom(scope, a, implicitScope)
    const restore = prepareWriteAtom(scope, scopedAtom, a, implicitScope, writeScope)
    try {
      return set(scopedAtom as AnyWritableAtom, ...v)
    } finally {
      restore?.()
    }
  }
}

function createScopedRead<T extends Atom<unknown>>(scope: Scope, read: T['read'], implicitScope?: Scope): T['read'] {
  return function scopedRead(get, opts) {
    return read(createScopedGet(scope, get, implicitScope), opts)
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
      createScopedGet(scope, get, implicitScope),
      createScopedSet(scope, set, implicitScope, writeScope),
      ...args
    )
  }
}

// ---------------------------------------------------------------------------------

type CreateScopeProps = {
  atoms?: Iterable<AnyAtom>
  atomFamilies?: Iterable<AnyAtomFamily>
  parentStore: Store
  name?: string
}

export function createScope(props: CreateScopeProps): Store {
  const { atoms = [], atomFamilies = [], parentStore, name: scopeName } = props
  const atomsSet = new WeakSet(atoms)
  const parentScope = storeScopeMap.get(parentStore)
  const baseStore = parentScope?.[4] ?? parentStore

  const scope: Scope = [
    new WeakMap() as AtomPairMap,
    new WeakMap() as AtomPairMap,
    new WeakMap() as AtomPairMap,
    new WeakMap<Scope | GlobalScopeKey, AtomPairMap>(),
    baseStore,
    parentScope,
    new Set<() => void>(),
    undefined!, // Store - will be set after creating patched store
    new WeakMap(),
  ] as Scope
  const explicitMap = scope[0]
  const cleanupListeners = scope[6]

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  const scopedStore = createPatchedStore(scope)
  scope[7] = scopedStore
  storeScopeMap.set(scopedStore, scope)

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
    cleanupListeners.add(cleanupFamily)
  }

  return scopedStore
}

/** @returns a patched store that intercepts atom access to apply the scope */
function createPatchedStore(scope: Scope): Store {
  const baseStore = scope[4]
  const baseBuildingBlocks = getBuildingBlocks(baseStore)
  const storeState: BuildingBlocks = [...baseBuildingBlocks]
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]
  const alreadyPatched: StoreHooks = {}
  const patchedASM = new WeakSet<AtomState>()
  const patchedMM = new WeakSet<Mounted>()

  storeState[9] = (_: Store, atom: AnyAtom) => atom.unstable_onInit?.(scopedStore)
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = scopedSub
  storeState[24] = function enhanceBuildingBlocks([...buildingBlocks]) {
    const patchedBuildingBlocks: BuildingBlocks = [
      patchWeakMap(buildingBlocks[0], patchAtomKey, patchAtomState), // atomStateMap
      patchWeakMap(buildingBlocks[1], patchAtomKey, patchMounted), //   mountedMap
      patchWeakMap(buildingBlocks[2]), //                                     invalidatedAtoms
      patchSet(buildingBlocks[3]), //                                         changedAtoms
      buildingBlocks[4], //                                                   mountCallbacks
      buildingBlocks[5], //                                                   unmountCallbacks
      patchStoreHooks(buildingBlocks[6]), //                                  storeHooks
      patchStoreFn(buildingBlocks[7]), //                                     atomRead
      patchStoreFn(buildingBlocks[8]), //                                     atomWrite
      buildingBlocks[9], //                                                   atomOnInit
      patchStoreFn(buildingBlocks[10]), //                                    atomOnMount
      patchEnsureAtomState(buildingBlocks[11]), //                            ensureAtomState
      buildingBlocks[12], //                                                  flushCallbacks
      buildingBlocks[13], //                                                  recomputeInvalidatedAtoms
      patchStoreFn(buildingBlocks[14]), //                                    readAtomState
      patchStoreFn(buildingBlocks[15]), //                                    invalidateDependents
      patchStoreFn(buildingBlocks[16]), //                                    writeAtomState
      patchStoreFn(buildingBlocks[17]), //                                    mountDependencies
      patchStoreFn(buildingBlocks[18]), //                                    mountAtom
      patchStoreFn(buildingBlocks[19]), //                                    unmountAtom
      patchStoreFn(buildingBlocks[20]), //                                    setAtomStateValueOrPromise
      patchStoreFn(buildingBlocks[21]), //                                    getAtom
      patchStoreFn(buildingBlocks[22]), //                                    setAtom
      patchStoreFn(buildingBlocks[23]), //                                    subAtom
      () => baseBuildingBlocks, //                                            enhanceBuildingBlocks (raw)
    ]
    return patchedBuildingBlocks
  }

  function patchEnsureAtomState(fn: EnsureAtomState) {
    const ensureAtomState = patchStoreFn(fn)
    return function patchedEnsureAtomState(store, atom) {
      const patchedASM = getBuildingBlocks(store)[0]
      const patchedAtomState = patchedASM.get(atom)
      if (patchedAtomState) {
        return patchedAtomState
      }
      patchedASM.set(atom, ensureAtomState(store, atom))
      return patchedASM.get(atom)
    } as EnsureAtomState
  }

  const scopedStore = buildStore(...storeState)
  if (scope.name && __DEV__) {
    Object.assign(scopedStore, { name: scope.name })
  }
  return scopedStore

  // ---------------------------------------------------------------------------------

  function getAtomForScope<T>(atom: Atom<T>): Atom<T> {
    return getAtom(scope, atom)[0]
  }

  function patchAtomKey<Params extends [AnyAtom, ...any]>(...[atom, ...args]: Params) {
    return [getAtomForScope(atom), ...args] as Params
  }

  function patchStoreAtomKey<Params extends [Store, AnyAtom, ...any]>(...[store, atom, ...args]: Params) {
    return [store, getAtomForScope(atom), ...args] as Params
  }

  function patchStoreFn<T extends (...args: any[]) => any>(fn: T) {
    const patchWithKey = patchFunction(patchStoreAtomKey)
    return patchWithKey(fn)
  }

  /** @returns a patched atomState that intercepts atom access to apply the scope */
  function patchAtomState<V extends AtomState | undefined>(atomState: V): V {
    if (!atomState) {
      return undefined as V
    }
    if (patchedASM.has(atomState)) {
      return atomState
    }
    const patchedAtomState = {
      ...atomState,
      d: patchWeakMap(atomState.d),
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
    } as NonNullable<V>
    patchedASM.add(patchedAtomState)
    return patchedAtomState
  }

  /** @returns a patched mounted that intercepts atom access to apply the scope */
  function patchMounted<V extends Mounted | undefined>(mounted: V): V {
    if (!mounted) {
      return undefined as V
    }
    if (patchedMM.has(mounted)) {
      return mounted
    }
    const patchedMounted = {
      ...mounted,
      d: patchSet(mounted.d),
      t: patchSet(mounted.t),
      get u() {
        return mounted.u
      },
      set u(v) {
        mounted.u = v
      },
    } as NonNullable<V>
    patchedMM.add(patchedMounted)
    return patchedMounted
  }

  function scopedSet<Value, Args extends any[], Result>(
    store: Store,
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ): Result {
    const [scopedAtom, implicitScope] = getAtom(scope, atom)
    const restore = prepareWriteAtom(scope, scopedAtom, atom, implicitScope, scope)
    try {
      return storeSet(store, scopedAtom as AnyWritableAtom, ...args)
    } finally {
      restore?.()
    }
  }

  function scopedSub(store: Store, atom: AnyAtom, listener: () => void): () => void {
    const [scopedAtom] = getAtom(scope, atom)
    const scopeListenersMap = scope[8]

    // Track this listener as belonging to this scope
    let listeners = scopeListenersMap.get(atom)
    if (!listeners) {
      listeners = new Set()
      scopeListenersMap.set(atom, listeners)
    }
    listeners.add(listener)

    // Subscribe to the scoped atom
    const unsub = storeSub(store, scopedAtom, listener)

    // Return an unsub that also removes the listener from our tracking
    return () => {
      listeners.delete(listener)
      if (listeners!.size === 0) {
        scopeListenersMap.delete(atom)
      }
      unsub()
    }
  }

  function patchWeakMap<T extends WeakMapForAtoms, V extends ReturnType<T['get']>>(
    wm: T,
    patchKeys: <P extends [AnyAtom, ...any]>(...args: P) => P = patchAtomKey,
    patchValue?: (value: V) => V //
  ): T {
    const patchWithKey = patchFunction(patchKeys)
    const patchWithKeyAndValue = patchFunction(patchKeys, patchValue)
    const patchedWm: any = {
      get: patchWithKeyAndValue(wm.get.bind(wm)),
      set: patchWithKey(wm.set.bind(wm)),
      has: patchWithKey(wm.has.bind(wm)),
      delete: patchWithKey(wm.delete.bind(wm)),
    }
    return patchedWm
  }

  function patchSet(
    s: WeakSetForAtoms,
    patchKeys: <P extends [AnyAtom, ...any]>(...args: P) => P = patchAtomKey //
  ): WeakSetForAtoms {
    const patchWithKey = patchFunction(patchKeys)
    return {
      get size() {
        return s.size
      },
      add: patchWithKey(s.add.bind(s)),
      has: patchWithKey(s.has.bind(s)),
      delete: patchWithKey(s.delete.bind(s)),
      clear: s.clear.bind(s),
      forEach: (cb) => s.forEach(patchWithKey(cb)),
      *[Symbol.iterator]() {
        for (const atom of s) yield getAtomForScope(atom)
      },
    }
  }

  function patchFunction<Params extends any[], Result extends any>(
    patchKeys: (...args: Params) => Params,
    patchValue?: (value: Result) => Result
  ) {
    return <T extends (...args: Params) => Result>(fn: T): T => {
      return ((...args) => {
        const value = fn(...patchKeys(...args))
        if (patchValue) {
          return patchValue(value)
        }
        return value
      }) as T
    }
  }

  function patchStoreHook(fn: StoreHookForAtoms | undefined) {
    if (!fn) {
      return undefined
    }
    const patchWithKey = patchFunction(patchAtomKey)
    const storeHook = patchWithKey(fn)
    storeHook.add = function patchAdd(atom, callback) {
      if (atom === undefined) {
        return fn.add(undefined, callback)
      }
      const [scopedAtom] = getAtom(scope, atom)
      return fn.add(scopedAtom, callback as () => void)
    }
    function patchAtomOrAll<K extends [AnyAtom | Record<any, never>, ...any]>(...[key, ...args]: K): K {
      if (Object.keys(key).length === 0) return [key, ...args] as K // all key
      type T = K extends [AnyAtom, ...any] ? K : never
      return patchAtomKey(...([key, ...args] as T))
    }
    storeHook.callbacks = patchWeakMap(fn.callbacks, patchAtomOrAll)
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
            get [hook]() {
              return (alreadyPatched[hook] ??= patchStoreHook(storeHooks[hook]))
            },
            set [hook](value: StoreHookForAtoms | undefined) {
              storeHooks[hook] = alreadyPatched[hook] = value
            },
            configurable: true,
            enumerable: true,
            writable: true,
          },
        ])
      )
    )
    return Object.assign(patchedStoreHooks, storeHooks)
  }
}
