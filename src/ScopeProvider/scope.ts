import { type Atom, atom } from 'jotai'
import {
  INTERNAL_Mounted,
  INTERNAL_buildStoreRev1 as INTERNAL_buildStore,
  INTERNAL_getBuildingBlocksRev1 as INTERNAL_getBuildingBlocks,
  INTERNAL_isSelfAtom,
  type INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { __DEV__ } from '../env'
import type {
  AnyAtom,
  AnyAtomFamily,
  AnyWritableAtom,
  BuildingBlocks,
  CloneAtom,
  Scope,
  ScopedStore,
} from '../types'
import { CONSUMER, EXPLICIT, SCOPE } from '../types'
import { isCloneAtom, isEqualSet } from '../utils'

const globalScopeKey: { name?: string } = {}
if (__DEV__) {
  globalScopeKey.name = 'unscoped'
  globalScopeKey.toString = toNameString
}

type GlobalScopeKey = typeof globalScopeKey

export function createScope({
  atomSet = new Set(),
  atomFamilySet = new Set(),
  parentStore,
  scopeName,
}: {
  atomSet?: Set<AnyAtom>
  atomFamilySet?: Set<AnyAtomFamily>
  parentStore: Store | ScopedStore
  scopeName?: string
}): ScopedStore {
  const parentScope = SCOPE in parentStore ? parentStore[SCOPE] : undefined
  const explicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  const implicit = new WeakMap<AnyAtom, [AnyAtom, Scope?]>()
  type ScopeMap = WeakMap<AnyAtom, [AnyAtom, Scope?]>
  const inherited = new WeakMap<Scope | GlobalScopeKey, ScopeMap>()

  const currentScope: Scope = {
    getAtom,
    cleanup() {},
    prepareWriteAtom(anAtom, originalAtom, implicitScope, writeScope) {
      if (
        originalAtom.read === defaultRead &&
        isWritableAtom(originalAtom) &&
        isWritableAtom(anAtom) &&
        originalAtom.write !== defaultWrite &&
        currentScope !== implicitScope
      ) {
        // atom is writable with init and holds a value
        // we need to preserve the value, so we don't want to copy the atom
        // instead, we need to override write until the write is finished
        const { write } = originalAtom
        anAtom.write = createScopedWrite(
          originalAtom.write.bind(
            originalAtom
          ) as (typeof originalAtom)['write'],
          implicitScope,
          writeScope
        )
        return () => {
          anAtom.write = write
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
  for (const anAtom of atomSet) {
    explicit.set(anAtom, [
      cloneAtom(anAtom, currentScope, EXPLICIT),
      currentScope,
    ])
  }

  const cleanupFamiliesSet = new Set<() => void>()
  for (const atomFamily of atomFamilySet) {
    for (const param of atomFamily.getParams()) {
      const anAtom = atomFamily(param)
      if (!explicit.has(anAtom)) {
        explicit.set(anAtom, [cloneAtom(anAtom, currentScope), currentScope])
      }
    }
    const cleanupFamily = atomFamily.unstable_listen((e) => {
      if (e.type === 'CREATE' && !explicit.has(e.atom)) {
        explicit.set(e.atom, [cloneAtom(e.atom, currentScope), currentScope])
      } else if (!atomSet.has(e.atom)) {
        explicit.delete(e.atom)
      }
    })
    cleanupFamiliesSet.add(cleanupFamily)
  }
  currentScope.cleanup = combineVoidFunctions(
    currentScope.cleanup,
    ...Array.from(cleanupFamiliesSet)
  )

  /**
   * Returns a scoped atom from the original atom.
   * @param anAtom
   * @param implicitScope the atom is implicitly scoped in the provided scope
   * @returns the scoped atom and the scope of the atom
   */
  function getAtom<T extends AnyAtom>(
    anAtom: T,
    implicitScope?: Scope
  ): [T, Scope?] {
    if (explicit.has(anAtom)) {
      return explicit.get(anAtom) as [T, Scope]
    }
    if (implicitScope === currentScope) {
      // dependencies of explicitly scoped atoms are implicitly scoped
      // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
      if (!implicit.has(anAtom)) {
        implicit.set(anAtom, [cloneAtom(anAtom, implicitScope), implicitScope])
      }
      return implicit.get(anAtom) as [T, Scope]
    }
    const scopeKey = implicitScope ?? globalScopeKey
    if (parentScope) {
      // inherited atoms are copied so they can access scoped atoms
      // but they are not explicitly scoped
      // dependencies of inherited atoms first check if they are explicitly scoped
      // otherwise they use their original scope's atom
      if (!inherited.get(scopeKey)?.has(anAtom)) {
        const [ancestorAtom, explicitScope] = parentScope.getAtom(
          anAtom,
          implicitScope
        )
        setInheritedAtom(
          inheritAtom(ancestorAtom, anAtom, explicitScope),
          anAtom,
          implicitScope,
          explicitScope
        )
      }
      return inherited.get(scopeKey)!.get(anAtom) as [T, Scope]
    }
    if (!inherited.get(scopeKey)?.has(anAtom)) {
      // non-primitive atoms may need to access scoped atoms
      // so we need to create a copy of the atom
      setInheritedAtom(inheritAtom(anAtom, anAtom), anAtom)
    }
    return inherited.get(scopeKey)!.get(anAtom) as [T, Scope?]
  }

  function setInheritedAtom<T extends AnyAtom>(
    scopedAtom: T,
    originalAtom: T,
    implicitScope?: Scope,
    explicitScope?: Scope
  ) {
    const scopeKey = implicitScope ?? globalScopeKey
    if (!inherited.has(scopeKey)) {
      inherited.set(scopeKey, new WeakMap())
    }
    inherited.get(scopeKey)!.set(
      originalAtom,
      [
        scopedAtom, //
        explicitScope,
      ].filter(Boolean) as [T, Scope?]
    )
  }

  /**
   * @returns a copy of the atom for derived atoms or the original atom for primitive and writable atoms
   */
  function inheritAtom<T>(
    anAtom: Atom<T>,
    originalAtom: Atom<T>,
    implicitScope?: Scope
  ) {
    if (originalAtom.read !== defaultRead) {
      return cloneAtom(originalAtom, implicitScope)
    }
    return anAtom
  }

  /**
   * @returns a scoped copy of the atom
   */
  function cloneAtom<T>(
    originalAtom: Atom<T>,
    implicitScope?: Scope,
    cloneType?: EXPLICIT | CONSUMER
  ) {
    const scopedAtom: CloneAtom<Atom<T>> = Object.create(
      // avoid reading `init` to preserve lazy initialization
      Object.getPrototypeOf(originalAtom),
      Object.getOwnPropertyDescriptors(originalAtom)
    )
    scopedAtom.o = originalAtom
    scopedAtom.x = cloneType

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
      scopedAtom.debugLabel = `${originalAtom.debugLabel}@${currentScope.name}`
    }

    return scopedAtom
  }

  function createScopedRead<T extends Atom<unknown>>(
    read: T['read'],
    implicitScope?: Scope
  ): T['read'] {
    return function scopedRead(get, opts) {
      return read(
        function scopedGet(a) {
          const [scopedAtom] = getAtom(a, implicitScope)
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

  const scopedStore = createPatchedStore(parentStore, currentScope)
  return scopedStore

  /**
   * @returns a patched store that intercepts get and set calls to apply the scope
   */
  function createPatchedStore(baseStore: Store, scope: Scope): ScopedStore {
    const baseBuildingBlocks = INTERNAL_getBuildingBlocks(baseStore)
    const [atomStateMap, mountedMap, invalidatedAtoms, changedAtoms] =
      baseBuildingBlocks
    const ensureAtomState = baseBuildingBlocks[11]
    const readAtomState = baseBuildingBlocks[14]
    const buildingBlocks: BuildingBlocks = [
      atomStateMap,
      undefined,
      invalidatedAtoms,
      changedAtoms,
    ]
    const internalMountedMap = new WeakMap<AnyAtom, INTERNAL_Mounted>()
    buildingBlocks[1] = {
      get: (atom) => {
        if (!isCloneAtom(atom)) return mountedMap.get(atom)
        if (!checkConsumer(atom)) return mountedMap.get(atom.o)
        return internalMountedMap.get(atom)
      },
      set: (atom, mounted) => {
        if (!isCloneAtom(atom)) return mountedMap.set(atom, mounted)
        if (!checkConsumer(atom)) return mountedMap.set(atom.o, mounted)
        return internalMountedMap.set(atom, mounted)
      },
      has: (atom) => {
        if (!isCloneAtom(atom)) return mountedMap.has(atom)
        if (!checkConsumer(atom)) return mountedMap.has(atom.o)
        return internalMountedMap.has(atom)
      },
      delete: (atom) => {
        if (!isCloneAtom(atom)) return mountedMap.delete(atom)
        if (!checkConsumer(atom)) return mountedMap.delete(atom.o)
        return internalMountedMap.delete(atom)
      },
    }
    buildingBlocks[14] = (atom) => {
      checkConsumer(atom)
      const deps = new Set(ensureAtomState(atom).d.keys())
      if (isCloneAtom(atom) && atom.x === undefined) {
        const newAtomState = readAtomState(atom.o)
        // deps changed?
        const newDeps = new Set(newAtomState.d.keys())
        if (!isEqualSet(deps, newDeps)) {
          checkConsumer(atom)
        }
        return newAtomState
      }
      return readAtomState(atom)
    }
    const wrappedBaseStore = INTERNAL_buildStore(...buildingBlocks)
    const storeShim: ScopedStore = {
      get(anAtom, ...args) {
        const [scopedAtom] = scope.getAtom(anAtom)
        return wrappedBaseStore.get(scopedAtom, ...args)
      },
      set(anAtom, ...args) {
        const [scopedAtom, implicitScope] = scope.getAtom(anAtom)
        const restore = scope.prepareWriteAtom(
          scopedAtom,
          anAtom,
          implicitScope,
          scope
        )
        try {
          return wrappedBaseStore.set(scopedAtom, ...args)
        } finally {
          restore?.()
        }
      },
      sub(anAtom, ...args) {
        const [scopedAtom] = scope.getAtom(anAtom)
        return wrappedBaseStore.sub(scopedAtom, ...args)
      },
      [SCOPE]: scope,
    }
    return Object.assign(wrappedBaseStore, storeShim) as ScopedStore

    /**
     * Check if the atom is a consumer.
     * Looks at the atom's dependencies to determine if it is a consumer.
     * Updates the atom's clone type with the new value if it changed.
     * Recursively checks the dependents if mounted.
     * @param atom
     * @returns true if the atom is a consumer
     */
    function checkConsumer(atom: AnyAtom): boolean {
      let atomState = ensureAtomState(atom)
      const mountedState = mountedMap.get(atom)
      if (!isCloneAtom(atom) || atom.x === EXPLICIT) {
        return false
      }

      if (!mountedState && mountedMap.has(atom.o)) {
        atomState = ensureAtomState(atom.o)
      }

      const dependencies = Array.from(atomState.d.keys()).filter(
        (a) => !INTERNAL_isSelfAtom(atom, a)
      )

      const isConsumer = dependencies.some(
        (atom) =>
          (isCloneAtom(atom) && (atom.x === CONSUMER || atom.x === EXPLICIT)) ||
          explicit.has(atom) // TODO: a consumer can also read consumers and inherited too.
      )
      if (atom.x === CONSUMER || atom.x === undefined) {
        const newValue = isConsumer ? CONSUMER : undefined
        if (atom.x !== newValue) {
          atom.x = newValue
          mountedState?.t.forEach(checkConsumer)
        }
      }
      return isConsumer
    }
  }
}

function isWritableAtom(anAtom: AnyAtom): anAtom is AnyWritableAtom {
  return 'write' in anAtom
}

const { read: defaultRead, write: defaultWrite } = atom<unknown>(null)

function toNameString(this: { name: string }) {
  return this.name
}

function combineVoidFunctions(...fns: (() => void)[]) {
  return function combinedFunctions() {
    for (const fn of fns) {
      fn()
    }
  }
}
