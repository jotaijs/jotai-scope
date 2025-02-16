import { type Atom, atom } from '../../jotai'
import { MapProxy } from './mapProxy'
import type {
  AnyAtom,
  AnyAtomFamily,
  AtomState,
  NamedStore,
  Scope,
  Store,
} from './types'
import { assertIsAtomStateWithDepListeners } from './types'
import { emplace } from './utils'

const scopeAtom = atom<Scope | null>(null)

/**
 * @returns a derived store that intercepts get and set calls to apply the scope
 */
export function createScope(
  atoms: Set<AnyAtom>,
  atomFamilies: Set<AnyAtomFamily>,
  baseStore: Store,
  debugName?: string
) {
  // ==================================================================================

  /** set of explicitly scoped atoms */
  const explicit = new WeakSet<AnyAtom>()

  /** set of implicitly scoped atoms */
  const implicit = new WeakSet<AnyAtom>()

  /** set of computed atoms that that consume explicit scoped atoms */
  const computedConsumer = new WeakSet<AnyAtom>()

  // ==================================================================================

  const parentScope = baseStore.get(scopeAtom)
  const store = deriveStore()
  const currentScope: Scope = {
    /**
     * Returns a scoped atom from the original atom.
     * @param anAtom
     * @param isFromExplicit the caller is an explicit or implicit atom
     * @returns the scoped atom
     */
    getAtom(anAtom, isFromExplicit = false) {
      // TODO: does getAtom do anything important?
      if (explicit.has(anAtom)) {
        return anAtom
      }
      // Since any computed atom can now call getAtom,
      // we need to know if the caller is an explicit or implicit atom
      // in order to determine if the atom should be implicitly scoped
      if (isFromExplicit) {
        // dependencies of explicitly scoped atoms are implicitly scoped
        // implicitly scoped atoms are only accessed by implicit and explicit scoped atoms
        implicit.add(anAtom)
        return anAtom
      }
      // TODO: do we need to clone inherited atoms?
      if (parentScope) {
        // inherited atoms are not copied but they can still access scoped atoms
        // in the current store with the read and write traps
        return parentScope.getAtom(anAtom)
      }
      return anAtom
    },
  }
  if (debugName) {
    currentScope.name = `scope:${debugName}`
    currentScope.toString = () => debugName
  }
  store.set(scopeAtom, currentScope)

  // ----------------------------------------------------------------------------------

  for (const anAtom of atoms) {
    explicit.add(anAtom)
  }

  const cleanupSet = new Set<() => void>()
  function cleanupAll() {
    for (const cleanup of cleanupSet) {
      cleanup()
    }
    cleanupSet.clear()
  }

  for (const atomFamily of atomFamilies) {
    for (const param of atomFamily.getParams()) {
      const anAtom = atomFamily(param)
      explicit.add(anAtom)
    }
    cleanupSet.add(
      atomFamily.unstable_listen(({ type, atom: anAtom }) => {
        if (type === 'CREATE') {
          explicit.add(anAtom)
        } else if (!atoms.has(anAtom)) {
          explicit.delete(anAtom)
        }
      })
    )
  }

  // ----------------------------------------------------------------------------------

  function fromExplicit(anAtom: AnyAtom) {
    return implicit.has(anAtom) || explicit.has(anAtom)
  }

  function deriveStore() {
    const derivedStore: NamedStore = baseStore.unstable_derive(
      (baseGetAtomState, _baseReadTrap, _baseWriteTrap, ...args) => {
        /** map of scoped atoms to their atomState states */
        const scopedAtomStateMap = new WeakMap<AnyAtom, AtomState<any>>()

        /** set of proxied atom states */
        const proxiedAtomStateSet = new WeakSet<AnyAtom>()

        return [
          function getAtomState(anAtom) {
            if (explicit.has(anAtom)) {
              return emplace(anAtom, scopedAtomStateMap, () =>
                createAtomState()
              )
            }
            if (implicit.has(anAtom)) {
              return emplace(anAtom, scopedAtomStateMap, () =>
                createAtomState()
              )
            }
            // TODO: handle writable atoms
            // TODO: do we need to clone the computed atom?
            // TODO: do we need to doubly-link the computed atom state?
            if (isComputedAtom(anAtom)) {
              const baseAtomState = emplace(anAtom, proxiedAtomStateSet, () =>
                proxyAtomState(anAtom, baseGetAtomState(anAtom))
              )
              if (computedConsumer.has(anAtom)) {
                return emplace(anAtom, scopedAtomStateMap, () =>
                  createAtomState(baseAtomState)
                )
              }
            }
            // inherit atom state
            const r = baseGetAtomState(anAtom)
            return r
          },
          function atomReadTrap(anAtom, getter, options) {
            return anAtom.read(
              function atomReadScopedGetter(a) {
                return getter(currentScope.getAtom(a, fromExplicit(anAtom)))
              }, //
              options
            )
          },
          function atomWriteTrap(anAtom, getter, setter, ...args) {
            return anAtom.write(
              function atomWriteScopedGetter(a) {
                return getter(currentScope.getAtom(a, fromExplicit(anAtom)))
              },
              function atomWriteScopedSetter(a, ...v) {
                return setter(
                  currentScope.getAtom(a, fromExplicit(anAtom)),
                  ...v
                )
              },
              ...args
            )
          },
          ...args,
        ]
      }
    )
    if (debugName) {
      derivedStore.name = `store:${debugName}`
    }
    return derivedStore
  }

  /**
   * @modifies {ProxyMap<AnyAtom, number>} atomState.d
   * @modifies {Set<() => void>} atomState.l
   */
  function proxyAtomState<Value>(
    anAtom: Atom<Value>,
    atomState: AtomState<Value>
  ) {
    assertIsAtomStateWithDepListeners<Value>(atomState)
    atomState.s ??= new Map()
    const { d, l } = emplace(currentScope, atomState.s, () => ({
      d: new Set<AnyAtom>(),
      l: (action) => {
        const a = action.payload?.key as AnyAtom
        if (
          action.type === 'SET' &&
          (explicit.has(a) || computedConsumer.has(a))
        ) {
          d.add(a)
        }
        if (action.type === 'DELETE') {
          d.delete(a)
        }
        if (action.type === 'CLEAR') {
          d.clear()
        }
        if (d.size === 0) {
          computedConsumer.delete(anAtom)
        } else {
          computedConsumer.add(anAtom)
        }
        // TODO: handle the case when explicit atoms are added or removed
      },
    }))
    for (const [a, v] of atomState.d.entries()) {
      l({ type: 'SET', payload: { key: a, value: v } })
    }
    if (!(atomState.d instanceof MapProxy)) {
      atomState.d = new MapProxy(
        atomState.d.entries(),
        function notifyListeners(action) {
          for (const { l } of atomState.s.values()) {
            l(action)
          }
        }
      )
    }
    cleanupSet.add(() => atomState.s.delete(currentScope))
    return atomState
  }

  return { store, cleanup: cleanupAll }
}

function isComputedAtom(anAtom: AnyAtom) {
  return anAtom.read !== defaultRead
}

const { read: defaultRead } = atom(null)

/**
 * creates a new atom state
 *
 * if atomState is provided, it will be cloned
 */
function createAtomState<Value>(
  atomState?: AtomState<Value>
): AtomState<Value> {
  const newAtomState: AtomState<Value> = {
    n: 0,
    ...atomState,
    d: new Map(atomState?.d),
    p: new Set(atomState?.p),
  }
  if (atomState?.m) {
    newAtomState.m = {
      ...atomState?.m,
      l: new Set(atomState?.m.l),
      d: new Set(atomState?.m.d),
      t: new Set(atomState?.m.t),
    }
  }
  return newAtomState
}
