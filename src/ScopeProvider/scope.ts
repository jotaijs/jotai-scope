import type { Atom, WritableAtom } from 'jotai'
import { atom as createAtom } from 'jotai'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
} from 'jotai/vanilla/internals'
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
  INTERNAL_AtomRead as AtomRead,
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

export function createScope({
  atoms = [],
  atomFamilies = [],
  parentStore,
  name: scopeName,
}: {
  atoms?: Iterable<AnyAtom>
  atomFamilies?: Iterable<AnyAtomFamily>
  parentStore: Store | ScopedStore
  name?: string
}): ScopedStore {
  const atomsSet = new Set(atoms)
  const atomFamilySet = new Set(atomFamilies)
  const parentScope = storeScopeMap.get(parentStore)
  // Get the base store - either from parent scope or use parentStore as base
  const baseStore = parentScope?.baseStore ?? parentStore

  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>()
  const dependent = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const cloneToOriginal = new WeakMap<AnyAtom, AnyAtom>()

  const currentScope: Scope = {
    getAtom,
    baseStore,
    cleanup() {
      for (const cleanupFamilyListeners of cleanupFamiliesSet) {
        cleanupFamilyListeners()
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
  for (const atom of atomsSet) {
    const cloned = cloneAtom(atom, currentScope)
    cloneToOriginal.set(cloned, atom)
    explicit.set(atom, [cloned, currentScope])
  }

  const cleanupFamiliesSet = new Set<() => void>()
  for (const atomFamily of atomFamilySet) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      if (!explicit.has(atom)) {
        const cloned = cloneAtom(atom, currentScope)
        cloneToOriginal.set(cloned, atom)
        explicit.set(atom, [cloned, currentScope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen(({ type, atom }) => {
      const cloned = cloneAtom(atom, currentScope)
      if (type === 'CREATE' && !explicit.has(atom)) {
        cloneToOriginal.set(cloned, atom)
        explicit.set(atom, [cloned, currentScope])
      } else if (!atomsSet.has(atom)) {
        explicit.delete(atom)
        cloneToOriginal.delete(cloned)
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
    if (cloneToOriginal.has(atom)) {
      return getAtom<T>(cloneToOriginal.get(atom) as T, implicitScope)
    }

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
      if (atom.read === defaultRead) {
        scopeMap.set(atom, [ancestorAtom, explicitScope])
      } else {
        scopeMap.set(atom, [cloneAtom(atom, explicitScope), explicitScope])
      }
    }
    return scopeMap.get(atom) as [T, Scope?]
  }

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

    function createScopedRead<T extends Atom<unknown>>(
      read: T['read'],
      implicitScope?: Scope
    ): T['read'] {
      return function scopedRead(get, opts) {
        return read(
          function scopedGet(a) {
            if (isPatchAtomRead) {
              return get(a)
            }
            const [scopedAtom1] = getAtom(a, implicitScope)
            return get(scopedAtom1)
          }, //
          opts
        )
      }
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

  const isPatchAtomRead = 1 //
  const scopedStore = createPatchedStore(currentScope)
  storeScopeMap.set(scopedStore, currentScope)
  return Object.assign(scopedStore, { name: scopeName })

  /** @returns a patched store that intercepts atom access to apply the scope */
  function createPatchedStore(scope: Scope): ScopedStore {
    const storeState: BuildingBlocks = [...getBuildingBlocks(scope.baseStore)]
    const storeGet = storeState[21]
    const storeSet = storeState[22]
    const storeSub = storeState[23]
    const alreadyPatched: StoreHooks = {}

    if (isPatchAtomRead) storeState[7] = patchAtomRead(storeState[7])

    /** Inject scope-aware get into read */
    let i = 0
    function patchAtomRead(atomRead: AtomRead) {
      return function scopedAtomRead<Value>(
        store: Store,
        atom: Atom<Value>,
        get: <V>(a: Atom<V>) => V,
        options: { readonly signal: AbortSignal; readonly setSelf: never }
      ): Value {
        if (i++ > 10) {
          console.trace()
          throw new Error('infinite loop')
        }

        const scope = storeScopeMap.get(store)!
        const [, atomScope] = scope.getAtom(atom)
        function scopedGet<V>(a: Atom<V>): V {
          if (a === (atom as any)) return get(a)
          if (!cloneToOriginal.has(atom)) return get(a)
          const [scopedA] = scope.getAtom(a, atomScope)
          return get(scopedA)
        }
        return atomRead(store, atom, scopedGet, options)
      }
    }

    // storeState[8] = patchAtomWrite(storeState[8])
    storeState[9] = (_: Store, atom: AnyAtom) =>
      atom.unstable_onInit?.(scopedStore)
    storeState[21] = patchStoreFn(storeGet)
    storeState[22] = scopedSet
    storeState[23] = patchStoreFn(storeSub)
    storeState[24] = ([...buildingBlocks]) => {
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
        undefined, // enhanceBuildingBlocks
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

    function patchEnsureAtomState(
      patchedASM: AtomStateMap,
      fn: EnsureAtomState
    ) {
      return function patchedEnsureAtomState(store, atom) {
        const patchedAtomState = patchedASM.get(atom)
        if (patchedAtomState) {
          return patchedAtomState
        }
        patchedASM.set(atom, fn(store, atom))
        return patchedASM.get(atom)
      } as EnsureAtomState
    }

    // /** Inject scope-aware get and set into write */
    // function patchAtomWrite(atomWrite: AtomWrite) {
    //   return function scopedAtomWrite<Value, Args extends unknown[], Result>(
    //     store: Store,
    //     atom: WritableAtom<Value, Args, Result>,
    //     get: <V>(a: Atom<V>) => V,
    //     set: <V, A extends unknown[], R>(
    //       a: WritableAtom<V, A, R>,
    //       ...args: A
    //     ) => R,
    //     ...args: Args
    //   ): Result {
    //     const scope = storeScopeMap.get(store)!
    //     // Create scope-aware get that resolves dependencies
    //     const scopedGet = <V>(a: Atom<V>): V => {
    //       const [scopedAtom] = scope.getAtom(a, scope)
    //       return get(scopedAtom)
    //     }

    //     return atomWrite(
    //       store,
    //       atom,
    //       scopedGet,
    //       scopedSet.bind(null, store) as any,
    //       ...args
    //     )
    //   }
    // }

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
}

const { read: defaultRead, write: defaultWrite } = createAtom<unknown>(null)
