import type { Atom, Getter, Setter, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
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

// Track the original atom for any scoped/clone variant we create
const scopedToOriginalMap = new WeakMap<AnyAtom, AnyAtom>()

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

export function getAtom<T>(
  scope: Scope,
  atom: Atom<T>,
  implicitScope: Scope | undefined,
  cloneAtomFn: (atom: Atom<T>, implicitScope?: Scope) => Atom<T>,
  createMultiStableAtomFn: (atom: Atom<T>, implicitScope?: Scope) => Atom<T>
): [Atom<T>, Scope?] {
  const explicitMap = scope[0]
  const implicitMap = scope[1]
  const dependentMap = scope[2]
  const inheritedSource = scope[3]
  const parentScope = scope[5]
  // If the atom is already a scoped clone for this scope, return it directly to avoid remapping
  const scopedOriginal = scopedToOriginalMap.get(atom)
  if (scopedOriginal) {
    const explicitScoped = explicitMap.get(scopedOriginal)
    if (explicitScoped) {
      return explicitScoped
    }
  }
  const explicitEntry = explicitMap.get(atom)
  if (explicitEntry) {
    return explicitEntry
  }

  const dependentEntry = dependentMap.get(atom)
  if (dependentEntry) {
    return dependentEntry
  }

  if (implicitScope === scope) {
    // dependencies of explicitly scoped atoms are implicitly scoped
    // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
    let implicitEntry = implicitMap.get(atom)
    if (!implicitEntry) {
      implicitEntry = [cloneAtomFn(atom, implicitScope), implicitScope]
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
    ] = parentScope ? getAtom(parentScope, atom, implicitScope, cloneAtomFn, createMultiStableAtomFn) : [atom]
    const inheritedClone = isDerived(atom) ? createMultiStableAtomFn(atom, ancestorScope) : ancestorAtom
    inheritedEntry = [inheritedClone, ancestorScope]
    inheritedMap.set(atom, inheritedEntry)
  }
  return inheritedEntry
}

export function cleanup(scope: Scope): void {
  for (const cleanupFamilyListeners of scope[6]) {
    cleanupFamilyListeners()
  }
}

export function prepareWriteAtom<T extends AnyAtom>(
  scope: Scope,
  atom: T,
  originalAtom: T,
  implicitScope: Scope | undefined,
  writeScope: Scope | undefined,
  createScopedWriteFn: <W extends AnyWritableAtom>(
    write: W['write'],
    implicitScope?: Scope,
    writeScope?: Scope
  ) => W['write']
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
    atom.write = createScopedWriteFn(
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

export function getScope(scope: Scope, atom: AnyAtom): Scope | undefined {
  const explicitMap = scope[0]
  const implicitMap = scope[1]
  const dependentMap = scope[2]
  const parentScope = scope[5]
  if (explicitMap.has(atom)) {
    return scope
  }
  if (implicitMap.has(atom)) {
    return scope
  }
  if (dependentMap.has(atom)) {
    return scope
  }
  return parentScope ? getScope(parentScope, atom) : undefined
}

export function isScoped(scope: Scope, atom: AnyAtom): boolean {
  return getScope(scope, atom) !== undefined
}

function createScopedGet(
  getAtomFn: <T extends AnyAtom>(atom: T, implicitScope?: Scope) => [T, Scope?],
  get: Getter,
  implicitScope?: Scope
): Getter {
  return (a) => {
    const [scopedAtom] = getAtomFn(a, implicitScope)
    return get(scopedAtom)
  }
}

function createScopedSet(
  getAtomFn: <T extends AnyAtom>(atom: T, implicitScope?: Scope) => [T, Scope?],
  prepareWriteAtomFn: <T extends AnyAtom>(
    atom: T,
    originalAtom: T,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined,
  set: Setter,
  implicitScope?: Scope,
  writeScope = implicitScope
): Setter {
  return (a, ...v) => {
    const [scopedAtom] = getAtomFn(a, implicitScope)
    const restore = prepareWriteAtomFn(scopedAtom, a, implicitScope, writeScope)
    try {
      return set(scopedAtom, ...v)
    } finally {
      restore?.()
    }
  }
}

function createScopedRead<T extends Atom<unknown>>(
  getAtomFn: <A extends AnyAtom>(atom: A, implicitScope?: Scope) => [A, Scope?],
  read: T['read'],
  implicitScope?: Scope
): T['read'] {
  return function scopedRead(get, opts) {
    return read(createScopedGet(getAtomFn, get, implicitScope), opts)
  }
}

function createScopedWrite<T extends AnyWritableAtom>(
  getAtomFn: <A extends AnyAtom>(atom: A, implicitScope?: Scope) => [A, Scope?],
  prepareWriteAtomFn: <A extends AnyAtom>(
    atom: A,
    originalAtom: A,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined,
  write: T['write'],
  implicitScope?: Scope,
  writeScope = implicitScope
): T['write'] {
  return function scopedWrite(get, set, ...args) {
    return write(
      createScopedGet(getAtomFn, get, implicitScope),
      createScopedSet(getAtomFn, prepareWriteAtomFn, set, implicitScope, writeScope),
      ...args
    )
  }
}

/** @returns a scoped copy of the atom */
function cloneAtom<T>(
  scope: Scope,
  originalAtom: Atom<T>,
  implicitScope: Scope | undefined,
  getAtomFn: <A extends AnyAtom>(atom: A, implicitScope?: Scope) => [A, Scope?],
  prepareWriteAtomFn: <A extends AnyAtom>(
    atom: A,
    originalAtom: A,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined
): Atom<T> {
  // TODO: Delete these checks
  if (originalAtom.debugLabel?.startsWith('_')) {
    throw new Error('Cannot clone proxy atom')
  }
  if (originalAtom.debugLabel?.includes('@')) {
    throw new Error('Cannot clone already scoped atom')
  }
  // avoid reading `init` to preserve lazy initialization
  const propDesc = Object.getOwnPropertyDescriptors(originalAtom)
  Object.keys(propDesc)
    .filter((k) => ['read', 'write', 'debugLabel'].includes(k))
    .forEach((k) => (propDesc[k].configurable = true))
  const atomProto = Object.getPrototypeOf(originalAtom)
  const scopedAtom: Atom<T> = Object.create(atomProto, propDesc)

  if (isDerived(scopedAtom)) {
    scopedAtom.read = createScopedRead<typeof scopedAtom>(
      getAtomFn,
      originalAtom.read.bind(originalAtom),
      implicitScope
    )
  }

  if (isWritableAtom(scopedAtom) && isWritableAtom(originalAtom) && isCustomWrite(scopedAtom)) {
    scopedAtom.write = createScopedWrite(
      getAtomFn,
      prepareWriteAtomFn,
      originalAtom.write.bind(originalAtom),
      implicitScope
    )
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

  scopedToOriginalMap.set(scopedAtom, originalAtom)

  return scopedAtom
}

/**
 * Creates a multi-stable atom that can transition between unscoped and scoped states.
 * It is effectively one of two atoms depending on its dependencies.
 * @returns a multi-stable atom
 */
function createMultiStableAtom<T>(
  scope: Scope,
  originalAtom: Atom<T>,
  implicitScope: Scope | undefined,
  getAtomFn: <A extends AnyAtom>(atom: A, implicitScope?: Scope) => [A, Scope?],
  prepareWriteAtomFn: <A extends AnyAtom>(
    atom: A,
    originalAtom: A,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined,
  isScopedFn: (atom: AnyAtom) => boolean
): Atom<T> {
  // TODO: Delete these checks
  if (originalAtom.debugLabel?.startsWith('_')) {
    throw new Error('Cannot clone proxy atom')
  }
  if (originalAtom.debugLabel?.includes('@')) {
    throw new Error('Cannot clone already scoped atom')
  }

  const dependentMap = scope[2]
  const baseStore = scope[4]
  const scopedStore = scope[7]

  const scopedAtom = Object.assign({}, originalAtom)
  scopedToOriginalMap.set(scopedAtom, originalAtom)
  // Ensure dependencies of the scoped variant resolve with scoping rules (explicit atoms map to scoped clones).
  if (isDerived(scopedAtom)) {
    scopedAtom.read = createScopedRead<typeof scopedAtom>(
      getAtomFn,
      originalAtom.read.bind(originalAtom),
      undefined // do not implicitly scope unscoped deps; explicitMap handles scoped ones
    )
  }
  // Ensure writes from scoped variant stay in the scoped store
  if (isWritableAtom(scopedAtom) && isWritableAtom(originalAtom) && isCustomWrite(scopedAtom)) {
    scopedAtom.write = createScopedWrite(
      getAtomFn,
      prepareWriteAtomFn,
      originalAtom.write.bind(originalAtom),
      undefined,
      scope // write into this scope
    )
  }
  Object.defineProperty(scopedAtom, 'debugLabel', {
    get() {
      return `${originalAtom.debugLabel}@${scope.name}`
    },
    configurable: true,
    enumerable: true,
  })

  const buildingBlocks = getBuildingBlocks(baseStore)
  const atomStateMap = buildingBlocks[0]
  const mountedMap = buildingBlocks[1]
  const changedAtoms = buildingBlocks[3]
  const storeHooks = initializeStoreHooks(buildingBlocks[6])
  const atomRead = buildingBlocks[7]
  const atomWrite = buildingBlocks[8]
  const ensureAtomState = buildingBlocks[11]
  const readAtomState = buildingBlocks[14]
  const mountAtom = buildingBlocks[18]
  const unmountAtom = buildingBlocks[19]
  const scopeListenersMap = scope[8]

  const scopedBlocks = getBuildingBlocks(scopedStore)
  const scopedStoreHooks = initializeStoreHooks(scopedBlocks[6])
  const scopedAtomRead = scopedBlocks[7]
  const scopedAtomWrite = scopedBlocks[8]

  // Accessors for the scoped atom state across base and scoped stores (debug Map or WeakMap).
  const getScopedAtomState = () => atomStateMap.get(scopedAtom) ?? scopedBlocks[0].get(scopedAtom)
  const setScopedAtomState = (state: any) => {
    atomStateMap.set(scopedAtom, state)
    scopedBlocks[0].set(scopedAtom, state)
  }
  const hasScopedDependencies = (state?: AtomState) =>
    !!state?.d && [...state.d.keys()].some((dep) => isScopedFn(dep) || scopedToOriginalMap.has(dep))
  const { 14: proxyReadAtomState, 16: proxyWriteAtomState } = getBuildingBlocks(
    buildStore(
      ...(Object.assign([...scopedBlocks], {
        7: ((store, _atom, get, options) => {
          const targetAtom = proxyState.toAtom
          return scopedAtomRead(store, targetAtom, get, options)
        }) as AtomRead,
        8: ((store, _atom, get, set, ...args) => {
          const targetAtom = proxyState.toAtom as AnyWritableAtom
          return scopedAtomWrite(store, targetAtom, get, set, ...args)
        }) as AtomWrite,
      }) as Partial<BuildingBlocks>)
    )
  )

  // This atom can either be the unscoped originalAtom or the scopedAtom depending on its dependencies.
  // It calls the originalAtom's read function as needed.
  const proxyAtom = createAtom(() => {}) as Atom<T>

  // Track the previous dependencies to detect changes
  let prevDeps = new Set<AnyAtom>()

  /**
   * Syncs proxyAtom in dependencies' mounted.t sets.
   * Adds proxyAtom to new deps' mounted.t, removes from old deps' mounted.t.
   */
  function syncProxyInDepMountedT(): void {
    const toAtomState = atomStateMap.get(proxyState.toAtom)
    if (!toAtomState) return

    const currentDeps = new Set(toAtomState.d.keys())

    // Remove proxyAtom from deps that are no longer dependencies
    for (const dep of prevDeps) {
      if (!currentDeps.has(dep)) {
        const depMounted = mountedMap.get(dep)
        if (depMounted) {
          depMounted.t.delete(proxyAtom)
        }
      }
    }

    // Add proxyAtom to new deps' mounted.t
    for (const dep of currentDeps) {
      if (!prevDeps.has(dep)) {
        const depMounted = mountedMap.get(dep)
        if (depMounted) {
          depMounted.t.add(proxyAtom)
        }
      }
    }

    prevDeps = currentDeps
  }

  proxyAtom.read = function proxyRead() {
    const classA = processScopeClassification()
    let atomState = proxyReadAtomState(proxyState.store, proxyState.toAtom)
    const classB = processScopeClassification()
    if (classA !== classB) {
      atomState = proxyReadAtomState(proxyState.store, proxyState.toAtom)
    }

    // Sync proxyAtom in deps' mounted.t after each read
    syncProxyInDepMountedT()

    return returnAtomValue(atomState)
  }

  if (isWritableAtom(originalAtom)) {
    const writableProxy = proxyAtom as AnyWritableAtom
    writableProxy.write = function proxyWrite(_get, _set, ...args) {
      processScopeClassification()
      const writableTarget = proxyState.toAtom as AnyWritableAtom
      // Don't pass _get/_set - proxyWriteAtomState creates its own scoped getter/setter
      const result = proxyWriteAtomState(proxyState.store, writableTarget, ...args)
      // Keep proxyAtom's atomState in sync with the target after writes
      const targetState = ensureAtomState(proxyState.store, writableTarget)
      atomStateMap.set(proxyAtom, targetState)
      return result
    }
  }

  function getIsScoped() {
    // Always re-read originalAtom to get current dependencies
    const original = readAtomState(baseStore, originalAtom)
    // Only consider dependent scoping once a dependency indicates we should scope (e.g., a startsWith 'scoped').
    const hasScopedTrigger = original?.d.size
      ? [...original.d.keys()].some((dep) => {
          const depState = atomStateMap.get(dep)
          return typeof depState?.v === 'string' && depState.v.startsWith('scoped')
        })
      : false
    if (!hasScopedTrigger) return false

    // If any current dependencies have an explicit scoped counterpart in this scope, favor the scoped classification.
    const explicitMap = scope[0]
    const hasExplicitScopedDep = original?.d.size ? [...original.d.keys()].some((dep) => explicitMap.has(dep)) : false
    if (hasExplicitScopedDep) return true

    // Materialize the scoped state so we can inspect deps when trigger is present.
    const atomState = ensureAtomState(scopedStore, scopedAtom)
    if (!atomState) return false
    const dependencies = [...atomState.d.keys()]
    // if there are scoped dependencies, it is scoped
    if (dependencies.some((dep) => isScopedFn(dep) || scopedToOriginalMap.has(dep))) {
      return true
    }
    // if dependencies are the same (allowing scoped clones), it is unscoped
    if (
      dependencies.length === original!.d.size &&
      dependencies.every((a) => {
        const baseAtom = scopedToOriginalMap.get(a) ?? a
        return original!.d.has(baseAtom)
      })
    ) {
      return false
    }
    return true
  }

  let _isInitialized = false
  let lastScopedAtomState: any | undefined
  const proxyState = {
    get isScoped() {
      return dependentMap.has(originalAtom)
    },
    set isScoped(v: boolean) {
      if (v) {
        dependentMap.set(originalAtom, [proxyAtom, scope])
      } else {
        dependentMap.delete(originalAtom)
      }
    },
    get toAtom() {
      return proxyState.isScoped ? scopedAtom : originalAtom
    },
    get fromAtom() {
      return proxyState.isScoped ? originalAtom : scopedAtom
    },
    get store() {
      return proxyState.isScoped ? scopedStore : baseStore
    },
    get isInitialized() {
      return (_isInitialized ||= !!atomStateMap.get(proxyAtom) && isAtomStateInitialized(atomStateMap.get(proxyAtom)!))
    },
  }

  // Preserve last scoped snapshot on reads after detaching
  const originalScopedAtomRead = scopedAtom.read

  scopedAtom.read = function patchedScopedAtomRead(get, opts) {
    if (!proxyState.isScoped && lastScopedAtomState) {
      const frozen = freezeAtomStateSnapshot(lastScopedAtomState)
      setScopedAtomState(frozen)
      return frozen.v
    }

    // Cheap trigger check using the original atom's deps to avoid recursive scoped reads.
    const original = readAtomState(baseStore, originalAtom)
    const hasScopedTrigger = original?.d.size
      ? [...original.d.keys()].some((dep) => {
          const depState = atomStateMap.get(dep)
          return typeof depState?.v === 'string' && depState.v.startsWith('scoped')
        })
      : false

    // If trigger is gone (unscoped), reuse the last scoped snapshot (or the current
    // scoped state if it exists) instead of recomputing to undefined.
    if (!hasScopedTrigger) {
      const existingScopedState = getScopedAtomState()
      const snapshot = lastScopedAtomState || (existingScopedState?.v !== undefined ? existingScopedState : undefined)
      if (snapshot) {
        const frozen = freezeAtomStateSnapshot(snapshot)
        setScopedAtomState(frozen)
        return frozen.v
      }
    }

    return originalScopedAtomRead(get, opts)
  }

  const depSnapshotSymbol = Symbol('depSnapshotStates')

  function cloneAtomState<T extends AtomState>(state: T): T {
    return { ...state, d: new Map(state.d) } as T
  }

  // Clone the atom state and also capture clones of each dependency's atom state at this moment.
  function cloneAtomStateWithDepSnapshot<T extends AtomState>(state: T): T {
    const cloned = cloneAtomState(state)
    if (state.d?.size) {
      const depSnapshots = new Map<AnyAtom, AtomState>()
      const frozenDeps = new Map<any, any>()

      state.d.forEach((depVal, depAtom) => {
        const depState = atomStateMap.get(depAtom) ?? scopedBlocks[0].get(depAtom)
        if (!depState) return
        const depStateClone = cloneAtomState(depState)
        depSnapshots.set(depAtom, depStateClone)

        // Create a frozen dep atom clone so later mutations to the real dep don't leak into the snapshot.
        const frozenDepAtom: AnyAtom = { ...depAtom }
        if (__DEV__ && (depAtom as any).debugLabel) {
          Object.defineProperty(frozenDepAtom, 'debugLabel', {
            value: (depAtom as any).debugLabel,
            configurable: true,
            enumerable: true,
            writable: true,
          })
        }
        const frozenDepState = cloneAtomState(depStateClone)
        atomStateMap.set(frozenDepAtom, frozenDepState)
        frozenDeps.set(frozenDepAtom, depVal)
      })

      if (frozenDeps.size) {
        cloned.d = frozenDeps as AtomState['d']
      }
      ;(cloned as any)[depSnapshotSymbol] = depSnapshots
    }
    return cloned
  }

  // Creates a snapshot of an AtomState whose dependencies are "frozen" copies so that
  // later dependency value changes do not mutate the snapshot (useful for debug printing
  // after a scoped → unscoped transition).
  function freezeAtomStateSnapshot<T extends AtomState>(state: T): T {
    const snapshot = cloneAtomState(state)
    if (!state.d?.size) return snapshot

    const frozenDeps = new Map<any, any>()
    const depSnapshots: Map<AnyAtom, AtomState> | undefined = (state as any)[depSnapshotSymbol]

    const iterSource: Array<[AnyAtom, AtomState | undefined]> = depSnapshots
      ? [...depSnapshots.entries()]
      : [...state.d.entries()].map(([depAtom]) => [depAtom, atomStateMap.get(depAtom)])

    iterSource.forEach(([depAtom, depState]) => {
      const frozenDepAtom: AnyAtom = { ...depAtom }
      if (__DEV__ && (depAtom as any).debugLabel) {
        Object.defineProperty(frozenDepAtom, 'debugLabel', {
          value: (depAtom as any).debugLabel,
          configurable: true,
          enumerable: true,
          writable: true,
        })
      }
      const frozenDepState = depState ? cloneAtomState(depState) : ({ v: undefined, d: new Map() } as AtomState)

      // Prefer the original depVal from state.d (captured at snapshot time) to avoid
      // later dep mutations leaking into the frozen snapshot.
      const depVal = state.d.get(depAtom) ?? depState?.v
      frozenDepState.v = depVal

      atomStateMap.set(frozenDepAtom, frozenDepState)
      frozenDeps.set(frozenDepAtom, depVal)
    })

    snapshot.d = frozenDeps as AtomState['d']
    return snapshot
  }

  function snapshotScopedAtomState() {
    if (!proxyState.isScoped) return
    const state = getScopedAtomState()
    if (!state) return
    // Only snapshot while scopedAtom truly has scoped dependencies
    if (hasScopedDependencies(state) && state.v !== undefined) {
      lastScopedAtomState = cloneAtomStateWithDepSnapshot(state)
      // eslint-disable-next-line no-console
      console.log('snapshotScopedAtomState captured', (scopedAtom as any).debugLabel ?? '', 'v=', state.v)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Hook-based Mounting
  // ─────────────────────────────────────────────────────────────────────────────

  let cleanupToAtomHooks: (() => void) | undefined

  /**
   * Aliases proxyAtom.mounted to targetAtom.mounted and adds proxyAtom to dependencies' mounted.t.
   * Called during initial mount and when classification changes.
   */
  function aliasProxyToTarget(targetAtom: AnyAtom): void {
    const toMounted = mountedMap.get(targetAtom)
    if (toMounted) {
      // Alias proxyAtom to toMounted in the map
      mountedMap.set(proxyAtom, toMounted)

      // Add proxyAtom to each dependency's mounted.t
      const toAtomState = atomStateMap.get(targetAtom)
      if (toAtomState) {
        for (const dep of toAtomState.d.keys()) {
          const depMounted = mountedMap.get(dep)
          if (depMounted) {
            depMounted.t.add(proxyAtom)
          }
        }
      }
    }
  }

  /**
   * Removes proxyAtom from old target's dependencies' mounted.t.
   * Called when classification changes to clean up old target.
   */
  function unaliasProxyFromTarget(targetAtom: AnyAtom): void {
    const toAtomState = atomStateMap.get(targetAtom)
    if (toAtomState) {
      for (const dep of toAtomState.d.keys()) {
        const depMounted = mountedMap.get(dep)
        if (depMounted) {
          depMounted.t.delete(proxyAtom)
        }
      }
    }
  }

  /**
   * Sets up mount/unmount hooks on toAtom to alias proxyAtom.mounted.
   * Called when proxyAtom is first mounted and when classification changes.
   */
  function setupToAtomHooks(targetAtom: AnyAtom): void {
    // Teardown old hooks first
    cleanupToAtomHooks?.()

    const cleanups: (() => void)[] = []

    const unsubMount = storeHooks.m?.add(targetAtom, () => aliasProxyToTarget(targetAtom))
    const unsubUnmount = storeHooks.u?.add(targetAtom, () => {
      unaliasProxyFromTarget(targetAtom)
      mountedMap.delete(proxyAtom)
    })
    // When targetAtom is read/recomputed, check classification and sync deps
    const unsubRead = storeHooks.r?.add(targetAtom, () => {
      // Capture latest scoped state before any potential transition away
      if (targetAtom === scopedAtom && proxyState.isScoped) {
        snapshotScopedAtomState()
      }

      processScopeClassification()
      syncProxyInDepMountedT()
    })
    const unsubScopedRead =
      targetAtom === scopedAtom
        ? scopedStoreHooks.r?.add(targetAtom, () => {
            if (proxyState.isScoped) snapshotScopedAtomState()
          })
        : undefined

    const scopedChangeHandler = () => {
      // Refresh cached scoped snapshot on any change while still scoped, as long as
      // the value is concrete and deps include scoped atoms.
      {
        const state = getScopedAtomState()
        if (state && hasScopedDependencies(state) && state.v !== undefined) {
          lastScopedAtomState = cloneAtomStateWithDepSnapshot(state)
          // eslint-disable-next-line no-console
          console.log('storeHooks.c captured', (scopedAtom as any).debugLabel ?? '', 'v=', state.v)
        }
      }

      if (!lastScopedAtomState) return

      const original = readAtomState(baseStore, originalAtom)
      const hasScopedTrigger = original?.d.size
        ? [...original.d.keys()].some((dep) => {
            const depState = atomStateMap.get(dep)
            return typeof depState?.v === 'string' && depState.v.startsWith('scoped')
          })
        : false

      if (!hasScopedTrigger) {
        setScopedAtomState(freezeAtomStateSnapshot(lastScopedAtomState))
      }
    }

    const unsubChange = targetAtom === scopedAtom ? storeHooks.c?.add(targetAtom, scopedChangeHandler) : undefined
    const unsubScopedChange =
      targetAtom === scopedAtom ? scopedStoreHooks.c?.add(targetAtom, scopedChangeHandler) : undefined

    if (unsubMount) cleanups.push(unsubMount)
    if (unsubUnmount) cleanups.push(unsubUnmount)
    if (unsubRead) cleanups.push(unsubRead)
    if (unsubChange) cleanups.push(unsubChange)
    if (unsubScopedRead) cleanups.push(unsubScopedRead)
    if (unsubScopedChange) cleanups.push(unsubScopedChange)

    cleanupToAtomHooks = () => {
      cleanups.forEach((cleanup) => cleanup())
    }

    // If toAtom is already mounted, apply the alias immediately
    if (mountedMap.get(targetAtom)) {
      aliasProxyToTarget(targetAtom)
    }
  }

  /**
   * Sets up the mount hook on proxyAtom.
   * When proxyAtom is mounted, it mounts toAtom and aliases the mounted properties.
   */
  function setupProxyMountHook(): void {
    storeHooks.m?.add(proxyAtom, () => {
      // Get the orphaned mounted instance (created by jotai's mountAtom for proxyAtom)
      const orphaned = mountedMap.get(proxyAtom)

      // Mount toAtom first
      mountAtom(baseStore, proxyState.toAtom)

      // Get toAtom's mounted instance
      const toMounted = mountedMap.get(proxyState.toAtom)

      if (orphaned && toMounted) {
        // Make orphaned's properties reference toMounted's properties
        // This way, when storeSub adds listener to orphaned.l, it goes to toMounted.l
        const mutableOrphaned = orphaned as { -readonly [K in keyof Mounted]: Mounted[K] }
        mutableOrphaned.l = toMounted.l
        mutableOrphaned.d = toMounted.d
        mutableOrphaned.t = toMounted.t
        if (mutableOrphaned.u) (toMounted as typeof mutableOrphaned).u = mutableOrphaned.u

        // Alias proxyAtom to toMounted in the map
        mountedMap.set(proxyAtom, toMounted)

        // Add proxyAtom to each dependency's mounted.t
        const toAtomState = atomStateMap.get(proxyState.toAtom)
        if (toAtomState) {
          for (const dep of toAtomState.d.keys()) {
            const depMounted = mountedMap.get(dep)
            if (depMounted) {
              depMounted.t.add(proxyAtom)
            }
          }
        }
      }

      // Setup hooks for classification changes
      setupToAtomHooks(proxyState.toAtom)
    })

    storeHooks.u?.add(proxyAtom, () => {
      // Remove proxyAtom from dependencies' mounted.t
      const toAtomState = atomStateMap.get(proxyState.toAtom)
      if (toAtomState) {
        for (const dep of toAtomState.d.keys()) {
          const depMounted = mountedMap.get(dep)
          if (depMounted) {
            depMounted.t.delete(proxyAtom)
          }
        }
      }

      // Cleanup toAtom hooks
      cleanupToAtomHooks?.()
      cleanupToAtomHooks = undefined
    })
  }

  // Set up proxy mount hook immediately
  setupProxyMountHook()

  // ─────────────────────────────────────────────────────────────────────────────
  // Listener Transfer Functions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Gets the set of listeners subscribed to the proxy atom in this scope.
   * These are the listeners that need to be transferred when classification changes.
   */
  function getScopeListenersForProxy(): Set<() => void> {
    return (
      scopeListenersMap.get(proxyAtom) ||
      scopeListenersMap.get(proxyState.toAtom) ||
      scopeListenersMap.get(scopedAtom) ||
      scopeListenersMap.get(originalAtom) ||
      new Set()
    )
  }

  /**
   * Moves a listener from one atom's mounted.l to another.
   * Does not trigger mount/unmount - just transfers the listener reference.
   */
  function moveListenerBetweenAtoms(listener: () => void, fromAtom: AnyAtom, toAtom: AnyAtom): void {
    const fromMounted = mountedMap.get(fromAtom)
    const toMounted = mountedMap.get(toAtom)

    if (fromMounted) {
      fromMounted.l.delete(listener)
    }
    if (toMounted) {
      toMounted.l.add(listener)
    }
  }

  /**
   * Transfers all S1 listeners from the source atom to the target atom.
   * Called when classification changes between scoped and unscoped.
   */
  function transferScopeListeners(
    fromAtom: AnyAtom,
    toAtom: AnyAtom,
    listeners: Set<() => void> = getScopeListenersForProxy()
  ): void {
    for (const listener of listeners) {
      moveListenerBetweenAtoms(listener, fromAtom, toAtom)
    }
  }

  /**
   * Checks if an atom has any listeners remaining after transfer.
   */
  function hasRemainingListeners(atom: AnyAtom): boolean {
    const mounted = mountedMap.get(atom)
    return mounted ? mounted.l.size > 0 : false
  }

  /**
   * Unmounts an atom if it has no remaining listeners.
   * Returns true if the atom was unmounted.
   */
  function unmountAtomIfEmpty(atom: AnyAtom): boolean {
    if (atom === scopedAtom && lastScopedAtomState) {
      // Keep the scoped atom mounted so we retain its last scoped snapshot
      return false
    }

    if (!hasRemainingListeners(atom)) {
      const mounted = mountedMap.get(atom)
      if (mounted) {
        unmountAtom(baseStore, atom)
        return true
      }
    }
    return false
  }

  /**
   * Mounts an atom and returns its Mounted instance.
   */
  function ensureAtomMounted(atom: AnyAtom): Mounted {
    return mountAtom(baseStore, atom)
  }

  /**
   * Handles listener transfer when transitioning from unscoped to scoped.
   * - Moves S1 listeners from originalAtom (c0) to scopedAtom (c1)
   * - Mounts c1 if it receives listeners
   * - Unmounts c0 if it has no remaining listeners
   * - Sets up new hooks on scopedAtom
   */
  function handleTransitionToScoped(): void {
    const listeners = getScopeListenersForProxy()
    if (listeners.size === 0) return

    // Remove proxyAtom from old target's (originalAtom) dependencies' mounted.t
    unaliasProxyFromTarget(originalAtom)

    // Reassociate scoped listeners to scopedAtom in scopeListenersMap
    scopeListenersMap.set(scopedAtom, listeners)
    scopeListenersMap.delete(originalAtom)
    scopeListenersMap.delete(proxyAtom)

    // Mount c1 to receive the listeners
    ensureAtomMounted(scopedAtom)

    // Transfer listeners from c0 to c1
    transferScopeListeners(originalAtom, scopedAtom)

    // Unmount c0 if no S0 listeners remain
    unmountAtomIfEmpty(originalAtom)

    // Setup new hooks on scopedAtom and alias proxyAtom to it
    setupToAtomHooks(scopedAtom)

    // Add proxyAtom to changedAtoms so its listeners get notified
    // (jotai's changedAtoms has originalAtom, but listener is now on proxyAtom which aliases scopedAtom)
    changedAtoms.add(proxyAtom)
  }

  /**
   * Handles listener transfer when transitioning from scoped to unscoped.
   * - Moves S1 listeners from scopedAtom (c1) to originalAtom (c0)
   * - Ensures c0 is mounted to receive listeners
   * - Unmounts c1 after transfer
   * - Sets up new hooks on originalAtom
   */
  function handleTransitionToUnscoped(): void {
    const listeners = new Set(getScopeListenersForProxy())
    const scopedMounted = mountedMap.get(scopedAtom)
    if (scopedMounted) {
      for (const listener of scopedMounted.l) {
        listeners.add(listener)
      }
    }

    // Remove proxyAtom from old target's (scopedAtom) dependencies' mounted.t
    unaliasProxyFromTarget(scopedAtom)

    // Also detach scopedAtom itself from its dependency mounted.t so further updates don't re-compute it
    const scopedState = getScopedAtomState()
    if (scopedState) {
      for (const dep of scopedState.d.keys()) {
        const depMounted = mountedMap.get(dep)
        depMounted?.t.delete(scopedAtom)
      }
    }
    // As a safety net, scrub scopedAtom from any dep mounted.t that may still reference it
    for (const [, mounted] of mountedMap) {
      if (mounted.t?.has(scopedAtom)) {
        mounted.t.delete(scopedAtom)
      }
    }

    // Ensure c0 is mounted to receive the listeners
    if (!mountedMap.get(originalAtom)) {
      ensureAtomMounted(originalAtom)
    }

    // Keep c1 mounted as a cache holder so its state isn't garbage-collected when we detach
    if (!mountedMap.get(scopedAtom)) {
      ensureAtomMounted(scopedAtom)
    }

    // Transfer listeners from c1 to c0
    transferScopeListeners(scopedAtom, originalAtom, listeners)

    // Hard reset: ensure scopedAtom no longer holds any of the transferred listeners
    if (scopedMounted) {
      for (const listener of listeners) {
        scopedMounted.l.delete(listener)
      }
      scopedMounted.l.clear()
    }

    // Reassociate listeners back to originalAtom in scopeListenersMap
    if (listeners.size) {
      scopeListenersMap.set(originalAtom, listeners)
      scopeListenersMap.delete(scopedAtom)
      scopeListenersMap.delete(proxyAtom)
    }

    // Preserve scopedAtom's latest state so we can keep S1 snapshot after detaching.
    // Do NOT refresh the cache if the scoped trigger has disappeared, otherwise we would
    // overwrite the last good scoped snapshot with an unscoped dependency graph.
    {
      const state = getScopedAtomState()
      if (state && hasScopedDependencies(state) && state.v !== undefined) {
        lastScopedAtomState = cloneAtomStateWithDepSnapshot(state)
        // eslint-disable-next-line no-console
        console.log(
          'handleTransitionToUnscoped captured before detach',
          (scopedAtom as any).debugLabel ?? '',
          'v=',
          state.v
        )
      }
    }

    // Unmount c1 (it should have no listeners now) and drop its mounted entry to prevent re-computation
    unmountAtomIfEmpty(scopedAtom)
    mountedMap.delete(scopedAtom)

    // Restore the latest scoped state so that S1 snapshot is retained when unscoped
    if (lastScopedAtomState) {
      setScopedAtomState(freezeAtomStateSnapshot(lastScopedAtomState))
      // eslint-disable-next-line no-console
      const frozen = atomStateMap.get(scopedAtom)
      console.log(
        'handleTransitionToUnscoped restored',
        (scopedAtom as any).debugLabel ?? '',
        'v=',
        frozen?.v,
        'deps=',
        frozen?.d?.size
      )
    }

    // Ensure any pending notifications for scopedAtom are cleared after detaching
    changedAtoms.delete(scopedAtom)

    // Re-apply the cached scoped snapshot after the current flush completes
    if (lastScopedAtomState) {
      const frozen = freezeAtomStateSnapshot(lastScopedAtomState)
      setTimeout(() => {
        atomStateMap.set(scopedAtom, frozen)
      }, 0)
    }

    // Setup new hooks on originalAtom and alias proxyAtom to it
    setupToAtomHooks(originalAtom)

    // Add proxyAtom to changedAtoms so its listeners get notified
    // (jotai's changedAtoms has scopedAtom, but listener is now on proxyAtom which aliases originalAtom)
    changedAtoms.add(proxyAtom)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Checks if atomState dependencies are either dependent or explicit in current scope
   * and processes classification change.
   * @returns {boolean} isScoped
   *   1. atomState dependencies are either dependent or explicit in current scope
   *   2. atomState dependencies are different from originalAtomState dependencies
   */
  function processScopeClassification(): boolean {
    const isScoped = getIsScoped()
    const scopeChanged = isScoped !== proxyState.isScoped

    // Transfer listeners when classification changes
    if (scopeChanged) {
      if (isScoped) {
        handleTransitionToScoped()
      } else {
        handleTransitionToUnscoped()
      }
    }

    proxyState.isScoped = isScoped

    // if there is a scope change, or proxyAtom is not yet initialized, process classification change
    if (scopeChanged || !proxyState.isInitialized) {
      // Alias proxyAtom's atomState to toAtom's atomState
      const toAtomState = ensureAtomState(proxyState.store, proxyState.toAtom)
      atomStateMap.set(proxyAtom, toAtomState)
    }

    // Sync proxyAtom in deps' mounted.t after classification is updated
    // (must be after proxyState.isScoped is set so toAtom points to correct target)
    if (scopeChanged) {
      syncProxyInDepMountedT()
    }

    // Ensure the scoped snapshot is retained when we detach from scoped classification
    if (!isScoped && lastScopedAtomState) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('Restoring scoped snapshot', lastScopedAtomState.v, [...(lastScopedAtomState.d?.entries?.() ?? [])])
      }
      setScopedAtomState(freezeAtomStateSnapshot(lastScopedAtomState))
    }

    return isScoped
  }

  if (__DEV__) {
    Object.defineProperty(proxyAtom, 'debugLabel', {
      get() {
        return `_${originalAtom.debugLabel ?? String(originalAtom)}@${scope.name}`
      },
      configurable: true,
      enumerable: true,
    })
  }
  // ensureAtomState(baseStore, proxyAtom)
  return proxyAtom
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
  const cleanupFamiliesSet = scope[6]

  // Bound functions for use in callbacks
  const getAtomBound = <T extends AnyAtom>(atom: T, implicitScope?: Scope): [T, Scope?] =>
    getAtom(scope, atom, implicitScope, cloneAtomBound, createMultiStableAtomBound) as [T, Scope?]

  const prepareWriteAtomBound = <T extends AnyAtom>(
    atom: T,
    originalAtom: T,
    implicitScope?: Scope,
    writeScope?: Scope
  ): (() => void) | undefined =>
    prepareWriteAtom(scope, atom, originalAtom, implicitScope, writeScope, createScopedWriteBound)

  const isScopedBound = (atom: AnyAtom) => isScoped(scope, atom)

  const cloneAtomBound = <T>(originalAtom: Atom<T>, implicitScope?: Scope) =>
    cloneAtom(scope, originalAtom, implicitScope, getAtomBound, prepareWriteAtomBound)

  const createMultiStableAtomBound = <T>(originalAtom: Atom<T>, implicitScope?: Scope) =>
    createMultiStableAtom(scope, originalAtom, implicitScope, getAtomBound, prepareWriteAtomBound, isScopedBound)

  const createScopedWriteBound = <T extends AnyWritableAtom>(
    write: T['write'],
    implicitScope?: Scope,
    writeScope = implicitScope
  ): T['write'] => createScopedWrite(getAtomBound, prepareWriteAtomBound, write, implicitScope, writeScope)

  const scopedStore = createPatchedStore(scope, getAtomBound, prepareWriteAtomBound)
  scope[7] = scopedStore
  Object.assign(scopedStore, { name: scopeName })
  storeScopeMap.set(scopedStore, scope)

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of new Set(atoms)) {
    explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
  }

  for (const atomFamily of new Set(atomFamilies)) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
      if (type === 'CREATE' && !explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
      } else if (type === 'REMOVE' && !atomsSet.has(atom)) {
        explicitMap.delete(atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }

  return scopedStore
}

/** @returns a patched store that intercepts atom access to apply the scope */
function createPatchedStore(
  scope: Scope,
  getAtomFn: <T extends AnyAtom>(atom: T, implicitScope?: Scope) => [T, Scope?],
  prepareWriteAtomFn: <T extends AnyAtom>(
    atom: T,
    originalAtom: T,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined
): Store {
  const baseStore = scope[4]
  const baseBuildingBlocks = getBuildingBlocks(baseStore)
  const storeState: BuildingBlocks = [...baseBuildingBlocks]
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]
  const alreadyPatched: StoreHooks = {}

  storeState[9] = (_: Store, atom: AnyAtom) => atom.unstable_onInit?.(scopedStore)
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = scopedSub
  storeState[24] = function enhanceBuildingBlocks([...buildingBlocks]) {
    const patchedBuildingBlocks: BuildingBlocks = [
      patchWeakMap(buildingBlocks[0], patchGetAtomState), // atomStateMap
      patchWeakMap(buildingBlocks[1], patchGetMounted), // mountedMap
      patchWeakMap(buildingBlocks[2]), // invalidatedAtoms
      patchSet(buildingBlocks[3]), // changedAtoms
      buildingBlocks[4], // mountCallbacks
      buildingBlocks[5], // unmountCallbacks
      patchStoreHooks(buildingBlocks[6]), // storeHooks
      patchStoreFn(buildingBlocks[7]), // atomRead
      patchStoreFn(buildingBlocks[8]), // atomWrite
      buildingBlocks[9], // atomOnInit
      patchStoreFn(buildingBlocks[10]), // atomOnMount
      patchStoreFn(
        buildingBlocks[11], // ensureAtomState
        (fn) => patchEnsureAtomState(patchedBuildingBlocks[0], fn)
      ),
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
      () => baseBuildingBlocks, // enhanceBuildingBlocks (raw)
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
          return (k) => fn(getAtomFn(k)[0])
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
    const [scopedAtom, implicitScope] = getAtomFn(atom)
    const restore = prepareWriteAtomFn(scopedAtom, atom, implicitScope, scope)
    try {
      return storeSet(store, scopedAtom, ...args)
    } finally {
      restore?.()
    }
  }

  function scopedSub(store: Store, atom: AnyAtom, listener: () => void): () => void {
    const [scopedAtom] = getAtomFn(atom)
    const scopeListenersMap = scope[8]

    // Track this listener as belonging to this scope
    let listeners = scopeListenersMap.get(scopedAtom)
    if (!listeners) {
      listeners = new Set()
      scopeListenersMap.set(scopedAtom, listeners)
    }
    listeners.add(listener)

    // Subscribe to the scoped atom
    const unsub = storeSub(store, scopedAtom, listener)

    // Return an unsub that also removes the listener from our tracking
    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        scopeListenersMap.delete(scopedAtom)
      }
      unsub()
    }
  }

  function patchAtomFn<T extends (...args: any[]) => any>(fn: T, patch?: (fn: T) => T) {
    return function scopedAtomFn(atom, ...args) {
      const [scopedAtom] = getAtomFn(atom)
      const f = patch ? patch(fn) : fn
      return f(scopedAtom, ...args)
    } as T
  }

  function patchStoreFn<T extends (...args: any[]) => any>(fn: T, patch?: (fn: T) => T) {
    return function scopedStoreFn(store, atom, ...args) {
      const [scopedAtom] = getAtomFn(atom)
      const f = patch ? patch(fn) : fn
      return f(store, scopedAtom, ...args)
    } as T
  }

  function patchWeakMap<T extends WeakMapForAtoms>(wm: T, patch?: (fn: T['get']) => T['get']): T {
    const patchedWm: any = {
      get: patchAtomFn(wm.get.bind(wm), patch),
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

  function patchSet(s: WeakSetForAtoms): WeakSetForAtoms {
    return {
      get size() {
        return s.size
      },
      add: patchAtomFn(s.add.bind(s)),
      has: patchAtomFn(s.has.bind(s)),
      clear: s.clear.bind(s),
      forEach: (cb) => s.forEach(patchAtomFn(cb)),
      *[Symbol.iterator](): IterableIterator<AnyAtom> {
        for (const atom of s) yield getAtomFn(atom)[0]
      },
    }
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
      const [scopedAtom] = getAtomFn(atom)
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
