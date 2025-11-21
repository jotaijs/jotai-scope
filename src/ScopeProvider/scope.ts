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

type CreateScopeProps = {
  atoms?: Iterable<AnyAtom>
  atomFamilies?: Iterable<AnyAtomFamily>
  parentStore: Store | ScopedStore
  name?: string
}

export function createScope(props: CreateScopeProps): ScopedStore {
  const { atoms = [], atomFamilies = [], parentStore, name: scopeName } = props
  const atomsSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)
  const parentScope = storeScopeMap.get(parentStore)
  const baseStore = parentScope?.baseStore ?? parentStore
  const explicitMap = new WeakMap() as AtomPairMap
  const implicitMap = new WeakMap() as AtomPairMap
  const dependentMap = new WeakMap() as AtomPairMap
  const inheritedSource = new WeakMap<Scope | GlobalScopeKey, AtomPairMap>()
  const scope = {
    getAtom<T>(atom: Atom<T>, implicitScope?: Scope): [Atom<T>, Scope?] {
      // source getAtom is only called with implicitScope if the calling atom is explicit or implicit
      const explicitEntry = explicitMap.get(atom)
      if (explicitEntry) {
        return explicitEntry
      }

      if (implicitScope === scope) {
        // dependencies of explicitly scoped atoms are implicitly scoped
        // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
        let implicitEntry = implicitMap.get(atom)
        if (!implicitEntry) {
          implicitEntry = [cloneAtom(atom, implicitScope), implicitScope]
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
        ] = parentScope ? parentScope.getAtom(atom, implicitScope) : [atom]
        const inheritedClone = isDerived(atom)
          ? createMultiStableAtom(atom, ancestorScope)
          : ancestorAtom
        inheritedEntry = [inheritedClone, ancestorScope]
        inheritedMap.set(atom, inheritedEntry)
      }
      return inheritedEntry
    },
    cleanup() {
      for (const cleanupFamilyListeners of cleanupFamiliesSet) {
        cleanupFamilyListeners()
      }
    },
    prepareWriteAtom(atom, originalAtom, implicitScope, writeScope) {
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
    baseStore,
    getScope(atom) {
      if (explicitMap.has(atom)) {
        return scope
      }
      if (implicitMap.has(atom)) {
        return scope
      }
      if (dependentMap.has(atom)) {
        return scope
      }
      return parentScope?.getScope(atom)
    },
    isScoped(atom) {
      return scope.getScope(atom) !== undefined
    },
  } as Scope
  const scopedStore = createPatchedStore(scope)
  Object.assign(scopedStore, { name: scopeName })
  storeScopeMap.set(scopedStore, scope)

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of atomsSet) {
    explicitMap.set(atom, [cloneAtom(atom, scope), scope])
  }

  const cleanupFamiliesSet = new Set<() => void>()
  for (const atomFamily of atomFamilySet) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtom(atom, scope), scope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
      if (type === 'CREATE' && !explicitMap.has(atom)) {
        explicitMap.set(atom, [cloneAtom(atom, scope), scope])
      } else if (!atomsSet.has(atom)) {
        explicitMap.delete(atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }

  return scopedStore

  /** @returns a scoped copy of the atom */
  function cloneAtom<T>(originalAtom: Atom<T>, implicitScope?: Scope) {
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

  function createScopedRead<T extends Atom<unknown>>(
    read: T['read'],
    implicitScope?: Scope
  ): T['read'] {
    return function scopedRead(get, opts) {
      return read(createScopedGet(get, implicitScope), opts)
    }
  }

  function createScopedWrite<T extends AnyWritableAtom>(
    write: T['write'],
    implicitScope?: Scope,
    writeScope = implicitScope
  ): T['write'] {
    return function scopedWrite(get, set, ...args) {
      return write(
        createScopedGet(get, implicitScope),
        createScopedSet(set, implicitScope, writeScope),
        ...args
      )
    }
  }

  function createScopedGet(get: Getter, implicitScope?: Scope): Getter {
    return (a) => {
      const [scopedAtom] = scope.getAtom(a, implicitScope)
      return get(scopedAtom)
    }
  }

  function createScopedSet(
    set: Setter,
    implicitScope?: Scope,
    writeScope = implicitScope
  ): Setter {
    return (a, ...v) => {
      const [scopedAtom] = scope.getAtom(a, implicitScope)
      const restore = scope.prepareWriteAtom(
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
    }
  }

  /**
   * Creates a multi-stable atom that can transition between unscoped and scoped states.
   * It is effectively one of two atoms depending on its dependencies.
   * @returns a multi-stable atom
   */
  function createMultiStableAtom<T>(
    originalAtom: Atom<T>,
    implicitScope?: Scope
  ): Atom<T> {
    // TODO: Delete these checks
    if (originalAtom.debugLabel?.startsWith('_')) {
      throw new Error('Cannot clone proxy atom')
    }
    if (originalAtom.debugLabel?.includes('@')) {
      throw new Error('Cannot clone already scoped atom')
    }

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
    const mountDependencies = buildingBlocks[17]

    const { 14: proxyReadAtomState, 16: proxyWriteAtomState } =
      getBuildingBlocks(
        buildStore(
          ...(Object.assign([...buildingBlocks], {
            7: ((store, _atom, get, options) => {
              const targetAtom = proxyState.toAtom
              const getter = proxyState.isScoped ? createScopedGet(get) : get
              return atomRead(store, targetAtom, getter, options)
            }) as AtomRead,
            8: ((store, _atom, get, set, ...args) => {
              const targetAtom = proxyState.toAtom as AnyWritableAtom
              const getter = proxyState.isScoped ? createScopedGet(get) : get
              const setter = proxyState.isScoped
                ? createScopedSet(set, implicitScope)
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
      if (dependencies.some(scope.isScoped)) {
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
        return dependentMap.has(proxyAtom)
      },
      set isScoped(v: boolean) {
        if (v) {
          dependentMap.set(proxyAtom, [proxyAtom, scope])
        } else {
          dependentMap.delete(proxyAtom)
        }
      },
      get toAtom() {
        return proxyState.isScoped ? scopedAtom : originalAtom
      },
      get store() {
        return proxyState.isScoped ? scopedStore : baseStore
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
              const store = isScoped ? scopedStore : baseStore
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
        const handleMount = () => {
          const toMounted = mountedMap.get(proxyState.toAtom)!
          mountedMap.set(proxyAtom, toMounted)
          for (const a of toAtomState.d.keys()) {
            const aMounted = mountedMap.get(a)!
            aMounted.t.add(proxyAtom)
          }
        }
        unsubs.add(storeHooks.m?.add(proxyState.toAtom, handleMount))
        const handleUnmount = () => {
          mountedMap.delete(proxyAtom)
          for (const a of toAtomState.d.keys()) {
            const aMounted = mountedMap.get(a)!
            aMounted.t.delete(proxyAtom)
          }
        }
        unsubs.add(storeHooks.u?.add(proxyState.toAtom, handleUnmount))
        const toMounted = mountedMap.get(proxyState.toAtom)
        if (toMounted) {
          handleMount()
        } else {
          handleUnmount()
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
}

/** @returns a patched store that intercepts atom access to apply the scope */
function createPatchedStore(scope: Scope): ScopedStore {
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
          return (k) => fn(scope.getAtom(k)[0])
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

  function patchAtomFn<T extends (...args: any[]) => any>(
    fn: T,
    patch?: (fn: T) => T
  ) {
    return function scopedAtomFn(atom, ...args) {
      const [scopedAtom] = scope.getAtom(atom)
      const f = patch ? patch(fn) : fn
      return f(scopedAtom, ...args)
    } as T
  }

  function patchStoreFn<T extends (...args: any[]) => any>(
    fn: T,
    patch?: (fn: T) => T
  ) {
    return function scopedStoreFn(store, atom, ...args) {
      const [scopedAtom] = scope.getAtom(atom)
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
        for (const atom of s) yield scope.getAtom(atom)[0]
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
      const [scopedAtom] = scope.getAtom(atom)
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
