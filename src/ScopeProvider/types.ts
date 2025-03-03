import type { Atom, WritableAtom, getDefaultStore } from '../../jotai'
import type { AtomFamily } from '../../jotai/utils'

export type Store = ReturnType<typeof getDefaultStore>

export type NamedStore = Store & { name?: string }

export type AnyAtom = Atom<unknown> | WritableAtom<unknown, unknown[], unknown>

export type AnyWritableAtom = WritableAtom<unknown, unknown[], unknown>

export type AnyAtomFamily = AtomFamily<any, AnyAtom>

/* =================== Stolen from jotai/store.ts ================== */
type AnyValue = unknown
type AnyError = unknown
type OnUnmount = () => void

/**
 * Mutable atom state,
 * tracked for both mounted and unmounted atoms in a store.
 */
export type AtomState<Value = AnyValue> = {
  /**
   * Map of atoms that the atom depends on.
   * The map value is the epoch number of the dependency.
   */
  d: Map<AnyAtom, number>
  /**
   * Set of atoms with pending promise that depend on the atom.
   *
   * This may cause memory leaks, but it's for the capability to continue promises
   */
  p: Set<AnyAtom>
  /** The epoch number of the atom. */
  n: number
  /** Object to store mounted state of the atom. */
  /**
   * State tracked for mounted atoms. An atom is considered "mounted" if it has a
   * subscriber, or is a transitive dependency of another atom that has a
   * subscriber.
   *
   * The mounted state of an atom is freed once it is no longer mounted.
   *
   * only available if the atom is mounted
   */
  m?: {
    /** Set of listeners to notify when the atom value changes. */
    l: Set<() => void>
    /** Set of mounted atoms that the atom depends on. */
    d: Set<AnyAtom>
    /** Set of mounted atoms that depends on the atom. */
    t: Set<AnyAtom>
    /** Function to run when the atom is unmounted. */
    u?: OnUnmount
  }
  /** Atom value */
  v?: Value
  /** Atom error */
  e?: AnyError
}

export type WithScope<T extends Partial<AtomState> = Record<never, never>> =
  T & {
    /** Atom is explicitly scoped */
    x?: true
  }

export type WithOrigin<T extends AnyAtom> = T & { o?: T }
