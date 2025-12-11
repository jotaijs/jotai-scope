import { type Atom, type Getter, type Setter, type WritableAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_AtomState as AtomState,
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
  ScopedAtom,
  SetLike,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapLike,
} from '../types'
import { isCustomWrite, isDerived, isWritableAtom, storeHookWithOnce, toNameString } from '../utils'

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
function cloneAtom<T extends Atom<any>>(scope: Scope, baseAtom: T, implicitScope: Scope | undefined): ScopedAtom<T> {
  // avoid reading `init` to preserve lazy initialization
  const propDesc = Object.getOwnPropertyDescriptors(baseAtom)
  Object.keys(propDesc)
    .filter((k) => ['read', 'write', 'debugLabel'].includes(k))
    .forEach((k) => (propDesc[k].configurable = true))
  const atomProto = Object.getPrototypeOf(baseAtom)
  const scopedAtom: ScopedAtom<T> = Object.create(atomProto, propDesc)
  scopedAtom.__originalAtom = baseAtom
  // Store the scope level for fast lookup
  if (implicitScope) {
    scopedAtom.__scope = implicitScope
  }

  if (isDerived(scopedAtom)) {
    scopedAtom.read = createScopedRead<typeof scopedAtom>(scope, baseAtom.read.bind(baseAtom), implicitScope)
  }

  if (isWritableAtom(scopedAtom) && isWritableAtom(baseAtom) && isCustomWrite(scopedAtom)) {
    scopedAtom.write = createScopedWrite(scope, baseAtom.write.bind(baseAtom), implicitScope)
  }
  if (__DEV__) {
    Object.defineProperty(scopedAtom, 'debugLabel', {
      get() {
        return `${baseAtom.debugLabel}${scope.name?.replace('S', '')}`
      },
      configurable: true,
      enumerable: true,
    })
  }

  return scopedAtom
}

type ProxyState = {
  prevDeps: Set<AnyAtom>
  isScoped: boolean
  toAtom: AnyAtom
  fromAtom: AnyAtom
  store: Store
  isInitialized: boolean
  implicitScope: Scope | undefined
}

/**
 * Creates a multi-stable atom that can transition between unscoped and scoped states.
 * It is effectively one of two atoms depending on its dependencies.
 * @returns proxyState with current classification state
 */
function createMultiStableAtom<T>(
  scope: Scope,
  inheritedAtom: Atom<T>,
  implicitScope: Scope | undefined,
  baseAtom: Atom<T>
): ProxyState {
  const explicitMap = scope[0]
  const dependentMap = scope[2]
  const inheritedSource = scope[3]
  const baseStore = scope[4]
  const parentScope = scope[5]
  const scopedStore = scope[7]
  const proxyState: ProxyState = {
    prevDeps: new Set<AnyAtom>(),
    isScoped: false,
    toAtom: inheritedAtom,
    fromAtom: inheritedAtom,
    store: baseStore,
    isInitialized: false,
    implicitScope: undefined,
  }

  const scopedAtom = cloneAtom(scope, baseAtom, implicitScope)
  proxyState.fromAtom = scopedAtom

  const buildingBlocks = getBuildingBlocks(baseStore)
  const atomStateMap = buildingBlocks[0]
  const mountedMap = buildingBlocks[1]
  const invalidatedAtoms = buildingBlocks[2]
  const changedAtoms = buildingBlocks[3]
  const storeHooks = initializeStoreHooks(buildingBlocks[6])
  const ensureAtomState = buildingBlocks[11]
  const readAtomState = buildingBlocks[14]
  const mountAtom = buildingBlocks[18]
  const unmountAtom = buildingBlocks[19]

  function setIsScoped(v: boolean) {
    proxyState.isScoped = v
    // Key for inheritedSource map
    const source = implicitScope ?? globalScopeKey
    const currentInheritedMap = inheritedSource.get(source)
    if (v) {
      proxyState.fromAtom = inheritedAtom
      proxyState.toAtom = scopedAtom
      proxyState.store = scopedStore
      proxyState.implicitScope = scope
      // Update the scoped atom's scope to parent
      scopedAtom.__scope = scope
      // scoped: add to dependentMap, remove from inheritedMap
      dependentMap.set(baseAtom, [scopedAtom, implicitScope])
      currentInheritedMap?.delete(inheritedAtom)
    } else {
      proxyState.fromAtom = scopedAtom
      proxyState.toAtom = inheritedAtom
      proxyState.store = implicitScope?.[4] ?? baseStore
      proxyState.implicitScope = implicitScope
      // unscoped: add to inheritedMap, remove from dependentMap
      currentInheritedMap?.set(inheritedAtom, [inheritedAtom, undefined])
      dependentMap.delete(baseAtom)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Hook to re-check classification when toAtom is read
  // ─────────────────────────────────────────────────────────────────────────────

  const cleanupToAtomHook = storeHookWithOnce()

  function setupToAtomReadHook(toAtom: AnyAtom): void {
    const cleanupListeners = scope[6]
    cleanupToAtomHook()
    cleanupToAtomHook.once(storeHooks.r?.add(toAtom, processScopeClassification))
    cleanupToAtomHook.once(cleanupListeners.add(cleanupToAtomHook))
  }

  /**
   * Moves listeners from fromAtom to toAtom when classification changes.
   * Listeners subscribed in the current scope move with the classification.
   */
  function transferListeners(fromAtom: AnyAtom, toAtom: AnyAtom, store: Store): void {
    const fromMounted = mountedMap.get(fromAtom)
    if (!fromMounted) {
      return
    }

    // Get listeners that were subscribed in this scope
    const scopeListeners = collectListeners(scope, toAtom, inheritedAtom)
    if (scopeListeners.size === 0) {
      return
    }

    // Ensure toAtom is mounted since listeners exist
    ensureAtomState(store, toAtom)
    const toMounted = mountAtom(store, toAtom)

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
        unmountAtom(store, fromAtom)
      }
    }
  }

  /**
   * Checks if any dependency is scoped in the current scope.
   * @returns {boolean} isScoped
   */
  function processScopeClassification(): boolean {
    const atomState = atomStateMap.get(scopedAtom)
    let isScoped = false
    if (atomState) {
      isScoped = Array.from(atomState.d.keys()).some((dep) => (dep as ScopedAtom).__scope === scope)
    } else {
      const inheritedAtomState = readAtomState(implicitScope?.[4] ?? baseStore, inheritedAtom)
      const allDeps = new Set(inheritedAtomState.d.keys())
      for (const dep of allDeps) {
        const depAtom = (dep as ScopedAtom).__originalAtom ?? dep
        if (explicitMap.has(depAtom) || dependentMap.has(depAtom)) {
          isScoped = true
          break
        }
        for (const [d] of atomStateMap.get(dep)!.d) {
          allDeps.add(d)
        }
      }
    }
    const scopeChanged = isScoped !== proxyState.isScoped
    const newInheritedAtom = parentScope ? getAtom(parentScope, baseAtom)[0] : baseAtom
    const inheritedAtomChanged = newInheritedAtom !== inheritedAtom

    if (inheritedAtomChanged && proxyState.isInitialized) {
      const oldInheritedAtom = inheritedAtom
      inheritedAtom = newInheritedAtom
      // Transfer listeners from old inheritedAtom to new inheritedAtom
      transferListeners(oldInheritedAtom, newInheritedAtom, baseStore)
      // Update proxyState.toAtom if currently unscoped
      if (!proxyState.isScoped) {
        proxyState.toAtom = inheritedAtom
      }
    }

    // if there is a scope change, or proxyState is not yet initialized, process classification change
    if (scopeChanged || !proxyState.isInitialized) {
      setIsScoped(isScoped)
      // Transfer listeners when classification changes
      transferListeners(proxyState.fromAtom, proxyState.toAtom, proxyState.store)

      // Notify listeners if value changed
      const toAtomState = ensureAtomState(proxyState.store, proxyState.toAtom)
      invalidatedAtoms.set(proxyState.toAtom, toAtomState.n)
      changedAtoms.add(proxyState.toAtom)
      storeHooks.c?.(proxyState.toAtom)

      // Set up hook on new toAtom to re-check classification when it's read
      setupToAtomReadHook(proxyState.toAtom)
    }
    proxyState.isInitialized = true
    return isScoped
  }

  // Determine initial classification
  processScopeClassification()

  return proxyState
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

  if (isDerived(atom)) {
    const dependentEntry = dependentMap.get(atom)
    if (dependentEntry) {
      return dependentEntry
    }
  }

  const source = implicitScope ?? globalScopeKey
  let inheritedMap = inheritedSource.get(source)
  if (!inheritedMap) {
    inheritedMap = new WeakMap() as AtomPairMap
    inheritedSource.set(source, inheritedMap)
  }

  let inheritedEntry = inheritedMap.get(atom)
  if (inheritedEntry) {
    return inheritedEntry
  }

  const [ancestorAtom, ancestorScope] = parentScope ? getAtom(parentScope, atom, implicitScope) : [atom]

  if (isDerived(atom)) {
    const proxyState = createMultiStableAtom(scope, ancestorAtom, ancestorScope, atom)
    return [proxyState.toAtom, proxyState.isScoped ? scope : undefined]
  }

  inheritedEntry = [ancestorAtom, ancestorScope]
  inheritedMap.set(atom, inheritedEntry)
  return inheritedEntry
}

export function cleanup(scope: Scope): void {
  const cleanupListeners = scope[6]
  cleanupListeners()
}

function prepareWriteAtom<T extends AnyAtom>(
  scope: Scope,
  atom: T,
  inheritedAtom: T,
  implicitScope: Scope | undefined,
  writeScope: Scope | undefined
): (() => void) | undefined {
  if (
    !isDerived(inheritedAtom) &&
    isWritableAtom(inheritedAtom) &&
    isWritableAtom(atom) &&
    isCustomWrite(inheritedAtom) &&
    scope !== implicitScope
  ) {
    // atom is writable with init and holds a value
    // we need to preserve the value, so we don't want to copy the atom
    // instead, we need to override write until the write is finished
    const { write } = inheritedAtom
    atom.write = createScopedWrite(scope, inheritedAtom.write.bind(inheritedAtom), implicitScope, writeScope)
    const cleanupScopedWrite = () => {
      atom.write = write
    }
    const cleanupListeners = scope[6]
    cleanupListeners.once(cleanupScopedWrite)
    return cleanupScopedWrite
  }
  return undefined
}

/** Collects all listeners subscribed from the current scope to the ancestor scope where the atom is defined. */
function collectListeners(scope: Scope, toAtom: AnyAtom, inheritedAtom: AnyAtom): Set<() => void> {
  const listeners = new Set<() => void>()
  const atomScope = (toAtom as ScopedAtom).__scope

  function gatherListeners(scope: Scope): void {
    const scopeListenersMap = scope[8]
    const listenerSet = scopeListenersMap.get(inheritedAtom)
    if (listenerSet) {
      for (const listener of listenerSet) {
        listeners.add(listener)
      }
    }
  }
  let currentScope: Scope | undefined = scope
  // Only gather from current scope up to (but not beyond) atomScope
  while (currentScope) {
    gatherListeners(currentScope)
    if (currentScope === atomScope) {
      break
    }
    currentScope = currentScope[5]
  }
  return listeners
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

  const level = parentScope ? parentScope[9] + 1 : 1
  const scope: Scope = [
    new WeakMap() as AtomPairMap, //                       0: explicitMap
    new WeakMap() as AtomPairMap, //                       1: implicitMap
    new WeakMap() as AtomPairMap, //                       2: dependentMap
    new WeakMap<Scope | GlobalScopeKey, AtomPairMap>(), // 3: inheritedSource
    baseStore, //                                          4: baseStore
    parentScope, //                                        5: parentScope
    storeHookWithOnce(), //                                6: cleanupListeners
    undefined!, //                                         7: scopedStore
    new WeakMap(), //                                      8: scopeListenersMap
    level, //                                              9: level
  ] as Scope

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  const scopedStore = createPatchedStore(scope)
  scope[7] = scopedStore
  storeScopeMap.set(scopedStore, scope)

  const explicitMap = scope[0]
  const cleanupListeners = scope[6]

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
  const atomOnInit = storeState[9]
  const alreadyPatched: StoreHooks = {}
  const patchedASM = new WeakSet<AtomState>()
  const patchedMM = new WeakSet<Mounted>()

  storeState[9] = (_: Store, atom: AnyAtom) => atomOnInit(scopedStore, atom)
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = scopedSub
  storeState[24] = function enhanceBuildingBlocks([...buildingBlocks]) {
    const patchedBuildingBlocks: BuildingBlocks = [
      patchWeakMap(buildingBlocks[0], patchAtomKey, patchAtomState), // atomStateMap
      patchWeakMap(buildingBlocks[1], patchAtomKey, patchMounted), //   mountedMap
      patchWeakMap(buildingBlocks[2]), //                               invalidatedAtoms
      patchSet(buildingBlocks[3]), //                                   changedAtoms
      buildingBlocks[4], //                                             mountCallbacks
      buildingBlocks[5], //                                             unmountCallbacks
      patchStoreHooks(buildingBlocks[6]), //                            storeHooks
      patchStoreFn(buildingBlocks[7]), //                               atomRead
      patchStoreFn(buildingBlocks[8]), //                               atomWrite
      buildingBlocks[9], //                                             atomOnInit
      patchStoreFn(buildingBlocks[10]), //                              atomOnMount
      patchEnsureAtomState(buildingBlocks[11]), //                      ensureAtomState
      buildingBlocks[12], //                                            flushCallbacks
      buildingBlocks[13], //                                            recomputeInvalidatedAtoms
      patchStoreFn(buildingBlocks[14]), //                              readAtomState
      patchStoreFn(buildingBlocks[15]), //                              invalidateDependents
      patchStoreFn(buildingBlocks[16]), //                              writeAtomState
      patchStoreFn(buildingBlocks[17]), //                              mountDependencies
      patchStoreFn(buildingBlocks[18]), //                              mountAtom
      patchStoreFn(buildingBlocks[19]), //                              unmountAtom
      patchStoreFn(buildingBlocks[20]), //                              setAtomStateValueOrPromise
      patchStoreFn(buildingBlocks[21]), //                              getAtom
      patchStoreFn(buildingBlocks[22]), //                              setAtom
      patchStoreFn(buildingBlocks[23]), //                              subAtom
      () => baseBuildingBlocks, //                                      enhanceBuildingBlocks (raw)
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

  function patchWeakMap<T extends WeakMapLike<AnyAtom, any>, V extends ReturnType<T['get']>>(
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
    s: SetLike<AnyAtom>,
    patchKeys: <P extends [AnyAtom, ...any]>(...args: P) => P = patchAtomKey //
  ): SetLike<AnyAtom> {
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

  function patchFunction<Params extends any[], Result>(
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
            get: () => {
              return (alreadyPatched[hook] ??= patchStoreHook(storeHooks[hook]))
            },
            set: (value: StoreHookForAtoms | undefined) => {
              storeHooks[hook] = value
            },
            configurable: true,
            enumerable: true,
          },
        ])
      )
    )
    return patchedStoreHooks
  }
}
