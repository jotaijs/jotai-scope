import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_isAtomStateInitialized as isAtomStateInitialized,
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
  ProxyState,
  Scope,
  ScopedStore,
  StoreHookForAtoms,
  StoreHooks,
  WeakMapForAtoms,
  WeakSetForAtoms,
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

    const store = scope.baseStore
    const buildingBlocks = getBuildingBlocks(store)
    const atomStateMap = buildingBlocks[0]
    const ensureAtomState = buildingBlocks[11]
    const mountDependencies = buildingBlocks[17]

    const originalAtomState = atomStateMap.get(originalAtom)
    const proxyState: ProxyState = {
      get originalAtom() {
        return new WeakRef(originalAtom).deref()!
      },
      get scopedAtom() {
        return new WeakRef(scopedAtom).deref()!
      },
      // If the original atom state is not initialized, the proxy is considered scoped.
      hasScoped: false,
      // !originalAtomState || !isAtomStateInitialized(originalAtomState),
    }

    const proxyAtom = createAtom(customRead) as T
    const proxyAtomState = ensureAtomState(store, proxyAtom)

    function customRead(get: <V>(a: Atom<V>) => V) {
      const originalAtomState = ensureAtomState(store, originalAtom)

      if (!processScopeClassification(originalAtom)) {
        // originalAtom is unscoped, return its value
        return originalAtomState.v
      }
      const value = get(scopedAtom)
      if (!processScopeClassification(scopedAtom)) {
        // scopedAtom is unscoped, return originalAtom's value
        return originalAtomState.v
      }
      return value
    }

    function getIsScoped(atom: AnyAtom) {
      const original = atomStateMap.get(originalAtom)
      // if originalAtom is not yet initialized, it is scoped
      if (!original || !isAtomStateInitialized(original)) {
        return true
      }
      const atomState = ensureAtomState(store, atom)
      const dependencies = [...atomState.d.keys()]
      // if there are scoped deps, it is scoped
      if (dependencies.some(scope.isScoped)) {
        return true
      }
      // if it is the originalAtom, it is unscoped
      if (atom === originalAtom) {
        return false
      }
      // if deps are the same, it is unscoped
      if (
        dependencies.length === original.d.size &&
        dependencies.every((a) => original.d.has(a))
      ) {
        return false
      }
      return true
    }

    /**
     * Checks if atomState deps are either dependent or explicit in current scope
     * and processes classification change.
     * @returns {boolean} isScoped
     *   1. atomState deps are either dependent or explicit in current scope
     *   2. atomState deps are different from originalAtomState deps
     */
    function processScopeClassification(atom: AnyAtom): boolean {
      const isScoped = getIsScoped(atom)
      const [fromAtom, toAtom] = isScoped
        ? [originalAtom, scopedAtom]
        : [scopedAtom, originalAtom]
      const scopeChange = isScoped !== proxyState.hasScoped
      proxyState.hasScoped = isScoped
      if (scopeChange || !isAtomStateInitialized(proxyAtomState)) {
        const toAtomState = ensureAtomState(store, toAtom)
        proxyAtomState.d.delete(fromAtom)
        proxyAtomState.d.set(toAtom, toAtomState.n)
        proxyAtomState.v = toAtomState.v
        // TODO: Do we need this?
        // proxyAtomState.n = toAtomState.n - 1
        mountDependencies(store, proxyAtom)
        const scopedAtomState = atomStateMap.get(scopedAtom)
        if (scopedAtomState && 'e' in scopedAtomState) {
          throw scopedAtomState.e
        }
      } else {
        const originalAtomState = atomStateMap.get(originalAtom)
        if (originalAtomState && 'e' in originalAtomState) {
          throw originalAtomState.e
        }
      }
      return isScoped
    }

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
