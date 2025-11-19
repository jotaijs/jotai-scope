import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_hasInitialValue as hasInitialValue,
  INTERNAL_returnAtomValue as returnAtomValue,
  INTERNAL_isAtomStateInitialized as isAtomStateInitialized,
  INTERNAL_addPendingPromiseToDependency as addPendingPromiseToDependency,
  INTERNAL_isPendingPromise as isPendingPromise,
  INTERNAL_isPromiseLike as isPromiseLike,
  INTERNAL_registerAbortHandler as registerAbortHandler,
  INTERNAL_isActuallyWritableAtom as isActuallyWritableAtom,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_BuildingBlocks as BuildingBlocks,
  INTERNAL_EnsureAtomState as EnsureAtomState,
  INTERNAL_ReadAtomState as ReadAtomState,
  INTERNAL_Mounted as Mounted,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { __DEV__ } from '../env'
import type {
  AnyAtom,
  AnyAtomFamily,
  AnyWritableAtom,
  ProxyState,
  Scope,
  ScopedStore,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapForAtoms,
  WeakSetForAtoms,
  WithOriginal,
} from '../types'
import { storeScopeMap } from '../types'
import {
  isCustomWrite,
  isDerived,
  isWritableAtom,
  toNameString,
} from '../utils'

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

  // Get the base store - either from parent scope or use parentStore as base
  const store = parentScope?.baseStore ?? parentStore

  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const dependent = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>()

  const scope = {
    getAtom<T extends AnyAtom>(atom: T, implicitScope?: Scope): [T, Scope?] {
      if (explicit.has(atom)) {
        return explicit.get(atom) as [T, Scope]
      }

      if (implicitScope === scope) {
        // dependencies of explicitly scoped atoms are implicitly scoped
        // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
        if (!implicit.has(atom)) {
          implicit.set(atom, [cloneAtom(atom, implicitScope), implicitScope])
        }
        return implicit.get(atom) as [T, Scope]
      }
      // inherited atoms are copied so they can access scoped atoms
      // dependencies of inherited atoms first check if they are explicitly scoped
      // otherwise they use their original scope's atom
      const scopeKey = implicitScope ?? globalScopeKey
      if (!inherited.has(scopeKey)) {
        inherited.set(scopeKey, new WeakMap())
      }
      const scopeMap = inherited.get(scopeKey)!
      if (!scopeMap.has(atom)) {
        const [
          ancestorAtom,
          explicitScope, //
        ] = parentScope ? parentScope.getAtom(atom, implicitScope) : [atom]
        const inheritedClone = isDerived(atom)
          ? processDerivedAtom(atom, explicitScope)
          : ancestorAtom
        scopeMap.set(atom, [inheritedClone, explicitScope])
      }
      return scopeMap.get(atom) as [T, Scope?]
    },
    baseStore: store,
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
    isScoped(atom) {
      if (explicit.has(atom)) {
        return true
      }
      if (implicit.has(atom)) {
        return true
      }
      if (dependent.has(atom)) {
        return true
      }
      return parentScope?.isScoped(atom) ?? false
    },
    isExplicit(atom) {
      return explicit.has(atom)
    },
    isImplicit(atom) {
      return implicit.has(atom)
    },
  } as Scope
  scope.baseProxy = createProxyStore(scope)
  const scopedStore = createPatchedStore(scope)
  Object.assign(scopedStore, { name: scopeName })
  storeScopeMap.set(scopedStore, scope)

  if (scopeName && __DEV__) {
    scope.name = scopeName
    scope.toString = toNameString
  }

  // populate explicitly scoped atoms
  for (const atom of atomsSet) {
    explicit.set(atom, [cloneAtom(atom, scope), scope])
  }

  const cleanupFamiliesSet = new Set<() => void>()
  for (const atomFamily of atomFamilySet) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicit.has(atom)) {
        explicit.set(atom, [cloneAtom(atom, scope), scope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
      if (type === 'CREATE' && !explicit.has(atom)) {
        explicit.set(atom, [cloneAtom(atom, scope), scope])
      } else if (!atomsSet.has(atom)) {
        explicit.delete(atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }

  return scopedStore

  /** @returns a scoped copy of the atom */
  function cloneAtom<T>(originalAtom: Atom<T>, implicitScope?: Scope) {
    // avoid reading `init` to preserve lazy initialization
    const propDesc = Object.getOwnPropertyDescriptors(originalAtom)
    Object.keys(propDesc)
      .filter((k) => ['read', 'write', 'debugLabel'].includes(k))
      .forEach((k) => (propDesc[k].configurable = true))
    const atomProto = Object.getPrototypeOf(originalAtom)
    const scopedAtom: WithOriginal<Atom<T>> = Object.create(atomProto, propDesc)
    scopedAtom.originalAtom = originalAtom

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

  /**
   * Process an unscoped derived atom by creating:
   * 1. A clone of the derived atom (A@S1)
   * 2. An intermediary atom (A?) that gets/sets A@S1
   * @returns the intermediary atom
   */
  function processDerivedAtom<T extends AnyAtom>(
    originalAtom: T,
    implicitScope?: Scope
  ): T {
    const scopedAtom = cloneAtom(originalAtom, implicitScope)

    const buildingBlocks = getBuildingBlocks(scope.baseProxy)
    const atomStateMap = buildingBlocks[0]
    const mountedMap = buildingBlocks[1]
    const invalidatedAtoms = buildingBlocks[2]
    const changedAtoms = buildingBlocks[3]
    const storeHooks = buildingBlocks[6]
    const customReadAtomState = buildingBlocks[14]
    const ensureAtomState = buildingBlocks[11]
    const proxyStore = scope.baseProxy

    function customRead() {
      const toAtom = proxyState.hasScoped
        ? proxyState.scopedAtom
        : proxyState.originalAtom

      // If c in _c1 is c0 (unscoped), check if we can handle it without recomputing
      if (!proxyState.hasScoped && isAtomStateInitialized(proxyAtomState)) {
        const toAtomState = atomStateMap.get(toAtom)

        // If the atom has already been computed and initialized
        if (toAtomState && isAtomStateInitialized(toAtomState)) {
          // Check if dependencies have changed
          const oldDeps = new Map(proxyAtomState.d)
          const newDeps = new Map(toAtomState.d)

          // Check if deps changed
          let depsChanged = oldDeps.size !== newDeps.size
          if (!depsChanged) {
            for (const [dep, epoch] of oldDeps) {
              if (newDeps.get(dep) !== epoch) {
                depsChanged = true
                break
              }
            }
          }

          if (depsChanged) {
            // Check if any new deps are scoped
            let hasNewScopedDeps = false
            for (const [dep] of newDeps) {
              if (scope.isScoped(dep)) {
                hasNewScopedDeps = true
                break
              }
            }

            if (hasNewScopedDeps) {
              // Change classification to dependent scoped
              console.log(
                `CLASSIFICATION CHANGE: ${originalAtom.debugLabel} -> dependent scoped`
              )

              // Swap to the scoped atom
              const scopedAtom = proxyState.scopedAtom
              const scopedAtomState = ensureAtomState(proxyStore, scopedAtom)

              // Update invalidated atoms
              if (changedAtoms.has(toAtom)) {
                const changed = [scopedAtom, ...changedAtoms].filter(
                  (atom) => atom !== toAtom
                )
                changedAtoms.clear()
                changed.forEach((atom) => changedAtoms.add(atom))
              }
              const invalidatedVersion = invalidatedAtoms.get(toAtom)
              if (invalidatedVersion !== undefined) {
                invalidatedAtoms.delete(toAtom)
                invalidatedAtoms.set(scopedAtom, scopedAtomState.n + 1)
              }

              proxyState.hasScoped = true

              // Now compute the scoped atom
              const derivedAtomState = customReadAtomState(
                proxyStore,
                scopedAtom
              )
              try {
                return returnAtomValue(derivedAtomState)
              } finally {
                proxyAtomState.d.set(scopedAtom, derivedAtomState.n)
                if (isPendingPromise(proxyAtomState.v)) {
                  addPendingPromiseToDependency(
                    proxyAtom,
                    proxyAtomState.v,
                    derivedAtomState
                  )
                }
                mountedMap.get(scopedAtom)?.t.add(proxyAtom)
              }
            }

            // Deps changed but no new scoped deps - update proxy atom value
            const prevValue = proxyAtomState.v
            proxyAtomState.v = toAtomState.v

            // Update dependencies
            proxyAtomState.d.clear()
            for (const [dep, epoch] of toAtomState.d) {
              proxyAtomState.d.set(dep, epoch)
            }

            // If value changed, fire mount callbacks
            if (prevValue !== toAtomState.v) {
              ++proxyAtomState.n
              const mounted = mountedMap.get(proxyAtom)
              if (mounted) {
                for (const listener of mounted.l) {
                  listener()
                }
              }
            }

            // Early return
            return returnAtomValue(proxyAtomState)
          }
        }
      }

      // Default behavior: call customReadAtomState
      const derivedAtomState = customReadAtomState(proxyStore, toAtom)
      try {
        return returnAtomValue(derivedAtomState)
      } finally {
        proxyAtomState.d.set(toAtom, derivedAtomState.n)
        if (isPendingPromise(proxyAtomState.v)) {
          addPendingPromiseToDependency(
            proxyAtom,
            proxyAtomState.v,
            derivedAtomState
          )
        }
        mountedMap.get(toAtom)?.t.add(proxyAtom)
      }
    }
    const proxyAtom = createAtom(customRead) as T
    const proxyAtomState = ensureAtomState(proxyStore, proxyAtom)

    const proxyState: ProxyState = {
      get originalAtom() {
        return new WeakRef(originalAtom).deref()!
      },
      get scopedAtom() {
        return new WeakRef(scopedAtom).deref()!
      },
      hasScoped: false,
    }

    function getAtomStateWithProxy(atom: AnyAtom) {
      return atomStateMap.get(atom) as
        | (AtomState & { x?: ProxyState })
        | undefined
    }
    function addProxyState(atom: AnyAtom) {
      const atomState = getAtomStateWithProxy(atom)
      if (atomState) {
        atomState.x = proxyState
      } else {
        storeHooks.a?.(atom, () => {
          const atomState = getAtomStateWithProxy(atom)!
          atomState.x = proxyState
        })
      }
    }
    addProxyState(originalAtom)
    addProxyState(scopedAtom)
    Object.defineProperty(proxyAtomState, 'n', {
      get() {
        return invalidatedAtoms.get(proxyAtom) ?? 0
      },
      set() {},
    })

    if (isWritableAtom(scopedAtom)) {
      ;(proxyAtom as AnyWritableAtom).write = (
        _get,
        set,
        ...args: unknown[]
      ) => {
        return set(scopedAtom, ...args)
      }
    }
    if (__DEV__) {
      Object.defineProperty(proxyAtom, 'debugLabel', {
        get() {
          return `_${originalAtom.debugLabel}@${scope.name}`
        },
        configurable: true,
        enumerable: true,
      })
    }

    return proxyAtom
  }

  function createScopedRead<T extends Atom<unknown>>(
    read: T['read'],
    implicitScope?: Scope
  ): T['read'] {
    return function scopedRead(get, opts) {
      return read(
        function scopedGet(a) {
          const [scopedAtom] = scope.getAtom(a, implicitScope)
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
          const [scopedAtom] = scope.getAtom(a, implicitScope)
          return get(scopedAtom)
        },
        function scopedSet(a, ...v) {
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
        },
        ...args
      )
    }
  }

  function createProxyStore(scope: Scope) {
    const store = scope.baseStore
    const buildingBlocks: BuildingBlocks = [...getBuildingBlocks(store)]
    const atomStateMap = buildingBlocks[0]
    const mountedMap = buildingBlocks[1]
    const invalidatedAtoms = buildingBlocks[2]
    const changedAtoms = buildingBlocks[3]
    const mountCallbacks = buildingBlocks[4]
    const unmountCallbacks = buildingBlocks[5]
    const storeHooks = buildingBlocks[6]
    const atomRead = buildingBlocks[7]
    // const atomWrite = buildingBlocks[8]
    // const atomOnInit = buildingBlocks[9]
    // const atomOnMount = buildingBlocks[10]
    const ensureAtomState = buildingBlocks[11]
    const flushCallbacks = buildingBlocks[12]
    const recomputeInvalidatedAtoms = buildingBlocks[13]
    const readAtomState = buildingBlocks[14]
    // const invalidateDependents = buildingBlocks[15]
    const writeAtomState = buildingBlocks[16]
    const mountDependencies = buildingBlocks[17]
    // const mountAtom = buildingBlocks[18]
    // const unmountAtom = buildingBlocks[19]
    const setAtomStateValueOrPromise = buildingBlocks[20]
    // const storeGet = buildingBlocks[21]
    // const storeSet = buildingBlocks[22]
    // const storeSub = buildingBlocks[23]

    function customReadAtomState<V>(store: Store, atom: Atom<V>) {
      const atomState = ensureAtomState(store, atom) as AtomState & {
        x: ProxyState
      }
      const proxyState = atomState.x
      // See if we can skip recomputing this atom.
      if (isAtomStateInitialized(atomState)) {
        // If the atom is mounted, we can use cached atom state.
        // because it should have been updated by dependencies.
        // We can't use the cache if the atom is invalidated.
        if (
          mountedMap.has(atom) &&
          invalidatedAtoms.get(atom) !== atomState.n
        ) {
          return atomState
        }
        // Otherwise, check if the dependencies have changed.
        // If all dependencies haven't changed, we can use the cache.
        if (
          Array.from(atomState.d).every(
            ([a, n]) =>
              // Recursively, read the atom state of the dependency, and
              // check if the atom epoch number is unchanged
              readAtomState(store, a).n === n
          )
        ) {
          return atomState
        }
      }
      // Compute a new state for this atom.
      atomState.d.clear()
      let isSync = true
      function mountDependenciesIfAsync() {
        if (mountedMap.has(atom)) {
          mountDependencies(store, atom)
          recomputeInvalidatedAtoms(store)
          flushCallbacks(store)
        }
      }
      function getter<V>(a: Atom<V>) {
        // -------------------------------------------------------
        // Check if the atom is scoped in this scope
        if (proxyState && scope.isScoped(a) !== !proxyState.hasScoped) {
          if (!isSync) {
            throw new Error(
              `Late get of scoped atom ${a.debugLabel || a} inside read of ${proxyState.originalAtom.debugLabel || proxyState.originalAtom} after dependency collection. Scoping/classification is sync-only; make sure you touch scoped atoms synchronously at the top of the read function or mark the atom as dependent.`
            )
          }
          // Atom has changed classification – swap the atoms
          const [fromAtom, toAtom] = scope.isScoped(a)
            ? [proxyState.originalAtom, proxyState.scopedAtom]
            : [proxyState.scopedAtom, proxyState.originalAtom]

          console.log(`SWAPPING ${fromAtom.debugLabel} -> ${toAtom.debugLabel}`)
          const toAtomState = ensureAtomState(store, toAtom)
          if (changedAtoms.has(fromAtom)) {
            const changed = [toAtom, ...changedAtoms].filter(
              (atom) => atom !== fromAtom
            )
            changedAtoms.clear()
            changed.forEach((atom) => changedAtoms.add(atom))
          }
          const invalidatedVersion = invalidatedAtoms.get(fromAtom)
          if (invalidatedVersion !== undefined) {
            invalidatedAtoms.delete(fromAtom)
            invalidatedAtoms.set(toAtom, toAtomState.n + 1)
          }
          proxyState.hasScoped = scope.isScoped(a)
        }

        if (a === (atom as AnyAtom)) {
          const aState = ensureAtomState(store, a)
          if (!isAtomStateInitialized(aState)) {
            if (hasInitialValue(a)) {
              setAtomStateValueOrPromise(store, a, a.init)
            } else {
              // NOTE invalid derived atoms can reach here
              throw new Error('no atom init')
            }
          }
          return returnAtomValue(aState)
        }
        // a !== atom
        const aState = readAtomState(store, a)
        try {
          return returnAtomValue(aState)
        } finally {
          atomState.d.set(a, aState.n)
          if (isPendingPromise(atomState.v)) {
            addPendingPromiseToDependency(atom, atomState.v, aState)
          }
          mountedMap.get(a)?.t.add(atom)
          if (!isSync) {
            mountDependenciesIfAsync()
          }
        }
      }
      let controller: AbortController | undefined
      let setSelf: ((...args: unknown[]) => unknown) | undefined
      const options = {
        get signal() {
          if (!controller) {
            controller = new AbortController()
          }
          return controller.signal
        },
        get setSelf() {
          if (
            import.meta.env?.MODE !== 'production' &&
            !isActuallyWritableAtom(atom)
          ) {
            console.warn('setSelf function cannot be used with read-only atom')
          }
          if (!setSelf && isActuallyWritableAtom(atom)) {
            setSelf = (...args) => {
              if (import.meta.env?.MODE !== 'production' && isSync) {
                console.warn('setSelf function cannot be called in sync')
              }
              if (!isSync) {
                try {
                  return writeAtomState(store, atom, ...args)
                } finally {
                  recomputeInvalidatedAtoms(store)
                  flushCallbacks(store)
                }
              }
            }
          }
          return setSelf
        },
      }
      const prevEpochNumber = atomState.n
      try {
        const valueOrPromise = atomRead(store, atom, getter, options as never)
        setAtomStateValueOrPromise(store, atom, valueOrPromise)
        if (isPromiseLike(valueOrPromise)) {
          registerAbortHandler(valueOrPromise, () => controller?.abort())
          valueOrPromise.then(
            mountDependenciesIfAsync,
            mountDependenciesIfAsync
          )
        }
        storeHooks.r?.(atom)
        return atomState
      } catch (error) {
        delete atomState.v
        atomState.e = error
        ++atomState.n
        return atomState
      } finally {
        isSync = false
        if (
          prevEpochNumber !== atomState.n &&
          invalidatedAtoms.get(atom) === prevEpochNumber
        ) {
          invalidatedAtoms.set(atom, atomState.n)
          changedAtoms.add(atom)
          storeHooks.c?.(atom)
        }
      }
    }

    buildingBlocks[14] = customReadAtomState as ReadAtomState
    return buildStore(...buildingBlocks)
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
    const patchedStoreHooks = {
      get r() {
        return (alreadyPatched.r ??= patchStoreHook(storeHooks.r))
      },
      set r(v) {
        storeHooks.r = v!
      },
      get c() {
        return (alreadyPatched.c ??= patchStoreHook(storeHooks.c))
      },
      set c(v) {
        storeHooks.c = v!
      },
      get m() {
        return (alreadyPatched.m ??= patchStoreHook(storeHooks.m))
      },
      set m(v) {
        storeHooks.m = v!
      },
      get u() {
        return (alreadyPatched.u ??= patchStoreHook(storeHooks.u))
      },
      set u(v) {
        storeHooks.u = v!
      },
      get f() {
        return storeHooks.f
      },
      set f(v) {
        storeHooks.f = v
      },
    }
    return Object.assign(patchedStoreHooks, storeHooks)
  }
}
