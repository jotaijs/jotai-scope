import type { WritableAtom } from '../../jotai'
import { Atom } from '../../jotai'
import type {
  AnyAtom,
  AnyAtomFamily,
  AtomState,
  NamedStore,
  Store,
  WithOrigin,
  WithScope,
} from './types'
import { emplace } from './utils'

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
  const explicit = new WeakSet<AnyAtom>(atoms)

  /** set of implicitly scoped atoms */
  const implicit = new WeakSet<AnyAtom>()

  /** map of atoms to implicitly scoped atoms */
  const implicitMap = new WeakMap<AnyAtom, AnyAtom>()

  /** set of computed atoms that depend on explicit scoped atoms */
  const consumer = new WeakSet<AnyAtom>()

  /** set of cleanup functions */
  const cleanupSet = new Set<() => void>()

  /** map of scoped atoms to their atomState states */
  const atomStateMap = new Map<AnyAtom, WithScope<AtomState>>()

  function cleanup() {
    for (const c of cleanupSet) {
      c()
    }
    cleanupSet.clear()
  }

  for (const atomFamily of atomFamilies) {
    for (const param of atomFamily.getParams()) {
      const atom = atomFamily(param)
      explicit.add(atom)
    }
    cleanupSet.add(
      atomFamily.unstable_listen(({ type, atom: atom }) => {
        if (type === 'CREATE') {
          explicit.add(atom)
        } else if (!atoms.has(atom)) {
          explicit.delete(atom)
        }
      })
    )
  }

  function resolveAtom<T extends AnyAtom>(atom: AnyAtom, a: T): T {
    if (explicit.has(atom) && !explicit.has(a)) {
      const implicitAtom = emplace(
        a,
        implicitMap,
        Object.assign(cloneAtom, { o: a })
      )
      implicit.add(implicitAtom)
      return implicitAtom as T
    }
    return a
  }

  const store: NamedStore = baseStore.unstable_derive(
    (baseGetAtomState, _baseReadTrap, _baseWriteTrap, ...args) => {
      /**
       * Sets up observers for when dependencies are added or removed on `d`
       * @modifies {ProxyMap<AnyAtom, number>} atomState.d
       * @modifies {Set<() => void>} atomState.l
       *
       * a, b, C(a + b)
       *
       * S0[ ]: a0, b0, C0(a0 + b0) <-- unscoped
       * S1[b]: a0, b1, C0(a0 + b1) <-- isConsumer
       * S2[C]: a0, b0, C2(a2 + b2) <-- isExplicit
       * S3[ ]: a0, b0, C2(a2 + b2) <-- isInherited
       * S4[C]: a0, b0, C2(a4 + b4) <-- isExplicit
       * S5[b]: a0, b5, C2(a4 + b5) <-- isConsumer
       *
       * atomState C {
       *   d: Map(2) { a => 1, b => 1 }
       *   v: a + b
       *   m: {}
       * }
       *
       */

      function getAtomState<Value>(
        atom: WithOrigin<Atom<Value>>
      ): AtomState<Value> {
        // explicit atom are always scoped, return their scoped atomState
        if (explicit.has(atom)) {
          return emplace(atom, atomStateMap, () =>
            Object.assign(createAtomState<Value, WithScope>({ x: true }))
          )
        }
        // inherited implicit atoms are cloned and given `o` property to reference the original atom
        // if the original atom is explicitly scoped, return their original scoped atomState
        if (explicit.has(atom.o!)) {
          return emplace(atom.o!, atomStateMap, () =>
            Object.assign(createAtomState<Value, WithScope>({ x: true }))
          )
        }
        // implicit atoms are cloned, return their scoped atomState
        if (implicit.has(atom)) {
          return emplace(atom, atomStateMap, createAtomState<Value>)
        }
        /** inherited of explicit, implicit, or unscoped */
        const inheritedAtomState: WithScope<AtomState<Value>> =
          baseGetAtomState(atom)!
        if (inheritedAtomState.x) {
          // inherited explicit
          return inheritedAtomState
        }
        if (consumer.has(atom)) {
          // consumer
          return emplace(atom, atomStateMap, createAtomState<Value>)
        }
        // inherited implicit or unscoped
        return inheritedAtomState
      }

      function readAtomTrap<Value>(
        atom: Atom<Value>,
        ...[getter, options]: Parameters<Atom<Value>['read']>
      ) {
        consumer.delete(atom)
        function getterTrap<Value>(a: Atom<Value>) {
          if (!explicit.has(atom) && (explicit.has(a) || consumer.has(a))) {
            consumer.add(atom)
          }
          return getter(resolveAtom(atom, a))
        }
        return atom.read(getterTrap, options)
      }

      function writeAtomTrap<Value, Args extends unknown[], Result>(
        atom: WritableAtom<Value, Args, Result>,
        ...[getter, setter, ...args]: Parameters<
          WritableAtom<Value, Args, Result>['write']
        >
      ) {
        function getterTrap<Value>(a: Atom<Value>) {
          return getter(resolveAtom(atom, a))
        }
        function setterTrap<Value, Args extends unknown[], Result>(
          a: WritableAtom<Value, Args, Result>,
          ...args: Args
        ) {
          return setter(resolveAtom(atom, a), ...args)
        }
        return atom.write(getterTrap, setterTrap, ...args)
      }
      return [getAtomState, readAtomTrap, writeAtomTrap, ...args]
    }
  )
  if (debugName && process.env.NODE_ENV !== 'production') {
    store.name = debugName
  }

  return {
    store,
    cleanup,
    atomStateMap,
    explicit,
    implicit,
    implicitMap,
    consumer,
  }
}

function cloneAtom<T extends Atom<unknown>>(atom: T): T {
  return Object.create(
    Object.getPrototypeOf(atom),
    Object.getOwnPropertyDescriptors(atom)
  )
}

/**
 * creates a new atom state
 * @param atomState if atomState param is provided, it will be merged with the clone
 */
function createAtomState<
  Value,
  T extends Partial<AtomState<Value> & Record<string, unknown>> = Record<
    never,
    never
  >,
>(atomState?: T) {
  const newAtomState = {
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
  return newAtomState as T & AtomState<Value> & Record<string, unknown>
}

/*
  TODO:
    1. Inherited computed atoms read explicit, could hold their own value in each scope
    2. Computed atoms on first read

  explicit: defined explicitly by the user
  implicit: read by explicit or implicit
  inherit: reads from parent explicit
  computed: reads explicit or (inherited?)
  unscoped: read from base


  S2 ----------------------------------------------------------
  explicit: explicit.has(atom)
  implicit: explicit.has(implicitMap.get(atom))
  inherit: baseGetAtomState(atom, originAtomState)
    S1 --------------------------------------------------------
    explicit: parent::explicit.has(atom)
    implicit: IMPOSSIBLE
    inherit: parent::baseGetAtomState(atom, originAtomState)
      Base ----------------------------------------------------
      explicit: IMPOSSIBLE
      implicit: IMPOSSIBLE
      inherit: IMPOSSIBLE
      computed: IMPOSSIBLE
      unscoped: atomStateMap.has(atom)
    computed: unscopedConsumerSet.has(atom)
    unscoped: IMPOSSIBLE
  computed: unscopedConsumerSet.has(atom) 


    
  a, b, C(a + b)
  S1[a]: a1, b0, C0(a1 + b0)
  S2[C]: a1, b0, C2(a2 + b2)
  S3[b]: a1, b3, C2(a2 + b3)

  S3: getAtomState(a)
    isExplicit?: false
    isImplicit?: false
    const a1 = getInherited(a) :X:
    const a2 = getInherited(a)


  a, b, C(a + b), D(a + b + C(a + b)), E(a + b + C(a + b) + D(a + b + C(a + b)))
  S1[a]: a1, b0, C0(a1 + b0), D0(a1 + b0 + C0(a1 + b0)), E0(a1 + b0 + C0(a1 + b0) + D0(a1 + b0 + C0(a1 + b0)))
  S2[C]: a1, b0, C2(a2 + b2), D0(a1 + b0 + C2(a2 + b2)), E0(a1 + b0 + C2(a2 + b2) + D0(a1 + b0 + C2(a2 + b2)))
  S3[b]: a1, b3, C2(a2 + b3), D0(a1 + b3 + C2(a2 + b3)), E0(a1 + b3 + C2(a2 + b3) + D0(a1 + b3 + C2(a2 + b3)))
  S4[D]: a1, b3, C2(a2 + b3), D4(a4 + b4 + C4(a4 + b4)), E0(a1 + b3 + C2(a2 + b3) + D4(a4 + b4 + C4(a4 + b4)))
*/
