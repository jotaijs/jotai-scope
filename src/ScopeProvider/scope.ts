import type { Atom, WritableAtom, Getter, Setter } from 'jotai'
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
  ScopedStore,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapForAtoms,
  WeakSetForAtoms,
} from '../types'
import {
  isCustomWrite,
  isDerived,
  isWritableAtom,
  toNameString,
} from '../utils'

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
  // source getAtom is only called with implicitScope if the calling atom is explicit or implicit
  const explicitEntry = scope.explicitMap.get(atom)
  if (explicitEntry) {
    return explicitEntry
  }

  if (implicitScope === scope) {
    // dependencies of explicitly scoped atoms are implicitly scoped
    // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
    let implicitEntry = scope.implicitMap.get(atom)
    if (!implicitEntry) {
      implicitEntry = [cloneAtomFn(atom, implicitScope), implicitScope]
      scope.implicitMap.set(atom, implicitEntry)
    }
    return implicitEntry
  }

  const dependentEntry = scope.dependentMap.get(atom)
  if (dependentEntry) {
    return dependentEntry
  }

  // inherited atoms are copied so they can access scoped atoms
  // dependencies of inherited atoms first check if they are explicitly scoped
  // otherwise they use their original scope's atom
  const source = implicitScope ?? globalScopeKey
  let inheritedMap = scope.inheritedSource.get(source)
  if (!inheritedMap) {
    inheritedMap = new WeakMap() as AtomPairMap
    scope.inheritedSource.set(source, inheritedMap)
  }
  let inheritedEntry = inheritedMap.get(atom)
  if (!inheritedEntry) {
    const [
      ancestorAtom,
      ancestorScope, //
    ] = scope.parentScope
      ? getAtom(
          scope.parentScope,
          atom,
          implicitScope,
          cloneAtomFn,
          createMultiStableAtomFn
        )
      : [atom]
    const inheritedClone = isDerived(atom)
      ? createMultiStableAtomFn(atom, ancestorScope)
      : ancestorAtom
    inheritedEntry = [inheritedClone, ancestorScope]
    inheritedMap.set(atom, inheritedEntry)
  }
  return inheritedEntry
}

export function cleanup(scope: Scope): void {
  for (const cleanupFamilyListeners of scope.cleanupFamiliesSet) {
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
  if (scope.explicitMap.has(atom)) {
    return scope
  }
  if (scope.implicitMap.has(atom)) {
    return scope
  }
  if (scope.dependentMap.has(atom)) {
    return scope
  }
  return scope.parentScope ? getScope(scope.parentScope, atom) : undefined
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
      createScopedSet(
        getAtomFn,
        prepareWriteAtomFn,
        set,
        implicitScope,
        writeScope
      ),
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

  if (
    isWritableAtom(scopedAtom) &&
    isWritableAtom(originalAtom) &&
    isCustomWrite(scopedAtom)
  ) {
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

  const baseStore = scope.baseStore

  const scopedAtom = Object.assign({}, originalAtom)
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
  const invalidatedAtoms = buildingBlocks[2]
  const changedAtoms = buildingBlocks[3]
  const storeHooks = initializeStoreHooks(buildingBlocks[6])
  const atomRead = buildingBlocks[7]
  const atomWrite = buildingBlocks[8]
  const ensureAtomState = buildingBlocks[11]
  const _mountDependencies = buildingBlocks[17]
  const mountAtom = buildingBlocks[18]

  const { 14: proxyReadAtomState, 16: proxyWriteAtomState } = getBuildingBlocks(
    buildStore(
      ...(Object.assign([...buildingBlocks], {
        7: ((store, _atom, get, options) => {
          const targetAtom = proxyState.toAtom
          const getter = proxyState.isScoped
            ? createScopedGet(getAtomFn, get)
            : get
          return atomRead(store, targetAtom, getter, options)
        }) as AtomRead,
        8: ((store, _atom, get, set, ...args) => {
          const targetAtom = proxyState.toAtom as AnyWritableAtom
          const getter = proxyState.isScoped
            ? createScopedGet(getAtomFn, get)
            : get
          const setter = proxyState.isScoped
            ? createScopedSet(getAtomFn, prepareWriteAtomFn, set, implicitScope)
            : set
          return atomWrite(store, targetAtom, getter, setter, ...args)
        }) as AtomWrite,
      }) as Partial<BuildingBlocks>)
    )
  )

  // This atom can either be the unscoped originalAtom or the scopedAtom depending on its dependencies.
  // It calls the originalAtom's read function as needed.
  const proxyAtom = createAtom(() => {}) as Atom<T>

  proxyAtom.read = function proxyRead() {
    const classA = processScopeClassification()
    let atomState = proxyReadAtomState(proxyState.store, proxyAtom)
    const classB = processScopeClassification()
    if (classA !== classB) {
      atomState = proxyReadAtomState(proxyState.store, proxyAtom)
    }
    return returnAtomValue(atomState)
  }

  if (isWritableAtom(originalAtom)) {
    const writableProxy = proxyAtom as AnyWritableAtom
    writableProxy.write = function proxyWrite(get, set, ...args) {
      const writableTarget = proxyState.toAtom as AnyWritableAtom
      return proxyWriteAtomState(baseStore, writableTarget, get, set, ...args)
    }
  }

  function getIsScoped() {
    const original = atomStateMap.get(originalAtom)
    // if originalAtom is not yet initialized, it is scoped
    if (!original || !isAtomStateInitialized(original)) {
      return true
    }
    const atomState = ensureAtomState(baseStore, proxyState.toAtom)
    const dependencies = [...atomState.d.keys()]
    // if there are scoped dependencies, it is scoped
    if (dependencies.some(isScopedFn)) {
      return true
    }
    // if it is the originalAtom, it is unscoped
    if (proxyState.toAtom === originalAtom) {
      return false
    }
    // if dependencies are the same, it is unscoped
    if (
      dependencies.length === original.d.size &&
      dependencies.every((a) => original.d.has(a))
    ) {
      return false
    }
    return true
  }

  const unsubs = initializeStoreHooks({}).f

  let _isInitialized = false
  const proxyState = {
    get isScoped() {
      return scope.dependentMap.has(proxyAtom)
    },
    set isScoped(v: boolean) {
      if (v) {
        scope.dependentMap.set(proxyAtom, [proxyAtom, scope])
      } else {
        scope.dependentMap.delete(proxyAtom)
      }
    },
    get toAtom() {
      return proxyState.isScoped ? scopedAtom : originalAtom
    },
    get fromAtom() {
      return proxyState.isScoped ? originalAtom : scopedAtom
    },
    get store() {
      return proxyState.isScoped ? scope.scopedStore : baseStore
    },
    get isInitialized() {
      return (_isInitialized ||=
        !!atomStateMap.get(proxyAtom) &&
        isAtomStateInitialized(atomStateMap.get(proxyAtom)!))
    },
  }

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
    proxyState.isScoped = isScoped
    // if there is a scope change, or proxyAtom is not yet initialized, process classification change
    if (scopeChanged || !proxyState.isInitialized) {
      // TODO: which is the key? (originalAtom, proxyAtom, or scopedAtom)
      const toAtomState = ensureAtomState(proxyState.store, proxyState.toAtom)
      atomStateMap.set(proxyAtom, toAtomState)
      const toMounted = mountedMap.get(proxyState.toAtom)
      const handleMount = (atom: AnyAtom = proxyState.toAtom) => {
        const toMounted = mountedMap.get(atom)!
        mountedMap.set(proxyAtom, toMounted)
        for (const a of toAtomState.d.keys()) {
          const aMounted = mountedMap.get(a)!
          aMounted.t.add(proxyAtom)
        }
      }
      unsubs.add(storeHooks.m?.add(proxyState.toAtom, handleMount))
      const handleUnmount = (atom: AnyAtom = proxyState.toAtom) => {
        mountedMap.delete(proxyAtom)
        const atomState = atomStateMap.get(atom)
        if (!atomState) {
          return
        }
        for (const a of atomState.d.keys()) {
          const aMounted = mountedMap.get(a)
          if (aMounted) {
            aMounted.t.delete(proxyAtom)
          }
        }
      }
      const proxyMounted = mountedMap.get(proxyAtom)
      if (proxyMounted) {
        handleUnmount(proxyState.fromAtom)
      }
      const fromMounted = mountedMap.get(proxyState.fromAtom)
      if (fromMounted) {
        if (mountedMap.get(originalAtom)) {
          // TODO: how do we distinguish between callbacks mounted in S0 vs S1?
          // When splitting the atom, if S1 has callbacks, the toAtom should mount.
          // When joining the atom, if S1 has callbacks, the fromAtom should mount.
          mountAtom(baseStore, proxyState.toAtom)
        }
      }
      unsubs.add(storeHooks.u?.add(proxyState.toAtom, handleUnmount))
      if (toMounted) {
        handleMount()
      } else {
        handleUnmount()
      }
      unsubs()
      if (!isScoped) {
        unsubs.add(
          storeHooks.c?.add(proxyAtom, function handleProxyChange() {
            // swap proxy for original in changedAtoms
            if (!changedAtoms.has(proxyAtom)) {
              return
            }
            if ('delete' in changedAtoms) {
              ;(changedAtoms as unknown as WeakSet<AnyAtom>).delete(proxyAtom)
            } else {
              const changedAtomsSet = new Set(changedAtoms)
              changedAtomsSet.delete(proxyAtom)
              changedAtomsSet.forEach((a) => changedAtoms.add(a))
            }
            changedAtoms.add(proxyState.toAtom)
          })
        )
        unsubs.add(
          storeHooks.c?.add(proxyState.toAtom, function handleAtomChange() {
            processScopeClassification()
            const store = isScoped ? scope.scopedStore : baseStore
            invalidatedAtoms.set(proxyAtom, toAtomState.n)
            proxyReadAtomState(store, proxyState.toAtom)
            if (!isScoped) {
              // ensure proxy is also in invalidatedAtoms
              const epochNumber = invalidatedAtoms.get(originalAtom)
              if (epochNumber === undefined) {
                return
              }
              invalidatedAtoms.set(proxyAtom, epochNumber)
            }
          })
        )
      }
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
  parentStore: Store | ScopedStore
  name?: string
}

export function createScope(props: CreateScopeProps): ScopedStore {
  const { atoms = [], atomFamilies = [], parentStore, name: scopeName } = props
  const atomsSet = new WeakSet(atoms)
  const parentScope = storeScopeMap.get(parentStore)
  const baseStore = parentScope?.baseStore ?? parentStore

  // Create the scope object with all data fields
  const scope: Scope = {
    explicitMap: new WeakMap() as AtomPairMap,
    implicitMap: new WeakMap() as AtomPairMap,
    dependentMap: new WeakMap() as AtomPairMap,
    inheritedSource: new WeakMap<Scope | GlobalScopeKey, AtomPairMap>(),
    baseStore,
    parentScope,
    cleanupFamiliesSet: new Set<() => void>(),
    scopedStore: undefined!, // Will be set after creating patched store
  }

  // Bound functions for use in callbacks
  const getAtomBound = <T extends AnyAtom>(
    atom: T,
    implicitScope?: Scope
  ): [T, Scope?] =>
    getAtom(
      scope,
      atom,
      implicitScope,
      cloneAtomBound,
      createMultiStableAtomBound
    ) as [T, Scope?]

  const prepareWriteAtomBound = <T extends AnyAtom>(
    atom: T,
    originalAtom: T,
    implicitScope?: Scope,
    writeScope?: Scope
  ): (() => void) | undefined =>
    prepareWriteAtom(
      scope,
      atom,
      originalAtom,
      implicitScope,
      writeScope,
      createScopedWriteBound
    )

  const isScopedBound = (atom: AnyAtom) => isScoped(scope, atom)

  const cloneAtomBound = <T>(originalAtom: Atom<T>, implicitScope?: Scope) =>
    cloneAtom(
      scope,
      originalAtom,
      implicitScope,
      getAtomBound,
      prepareWriteAtomBound
    )

  const createMultiStableAtomBound = <T>(
    originalAtom: Atom<T>,
    implicitScope?: Scope
  ) =>
    createMultiStableAtom(
      scope,
      originalAtom,
      implicitScope,
      getAtomBound,
      prepareWriteAtomBound,
      isScopedBound
    )

  const createScopedWriteBound = <T extends AnyWritableAtom>(
    write: T['write'],
    implicitScope?: Scope,
    writeScope = implicitScope
  ): T['write'] =>
    createScopedWrite(
      getAtomBound,
      prepareWriteAtomBound,
      write,
      implicitScope,
      writeScope
    )

  const scopedStore = createPatchedStore(
    scope,
    getAtomBound,
    prepareWriteAtomBound
  )
  scope.scopedStore = scopedStore
  Object.assign(scopedStore, { name: scopeName })
  storeScopeMap.set(scopedStore, scope)

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of new Set(atoms)) {
    scope.explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
  }

  for (const atomFamily of new Set(atomFamilies)) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!scope.explicitMap.has(atom)) {
        scope.explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
      if (type === 'CREATE' && !scope.explicitMap.has(atom)) {
        scope.explicitMap.set(atom, [cloneAtomBound(atom, scope), scope])
      } else if (type === 'REMOVE' && !atomsSet.has(atom)) {
        scope.explicitMap.delete(atom)
      }
    })
    scope.cleanupFamiliesSet.add(cleanupFamily)
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
): ScopedStore {
  const baseBuildingBlocks = getBuildingBlocks(scope.baseStore)
  const storeState: BuildingBlocks = [...baseBuildingBlocks]
  const storeGet = storeState[21]
  const storeSet = storeState[22]
  const storeSub = storeState[23]
  const alreadyPatched: StoreHooks = {}

  storeState[9] = (_: Store, atom: AnyAtom) =>
    atom.unstable_onInit?.(scopedStore)
  storeState[21] = patchStoreFn(storeGet)
  storeState[22] = scopedSet
  storeState[23] = patchStoreFn(storeSub)
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

  function patchAtomFn<T extends (...args: any[]) => any>(
    fn: T,
    patch?: (fn: T) => T
  ) {
    return function scopedAtomFn(atom, ...args) {
      const [scopedAtom] = getAtomFn(atom)
      const f = patch ? patch(fn) : fn
      return f(scopedAtom, ...args)
    } as T
  }

  function patchStoreFn<T extends (...args: any[]) => any>(
    fn: T,
    patch?: (fn: T) => T
  ) {
    return function scopedStoreFn(store, atom, ...args) {
      const [scopedAtom] = getAtomFn(atom)
      const f = patch ? patch(fn) : fn
      return f(store, scopedAtom, ...args)
    } as T
  }

  function patchWeakMap<T extends WeakMapForAtoms>(
    wm: T,
    patch?: (fn: T['get']) => T['get']
  ): T {
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
