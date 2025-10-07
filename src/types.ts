import { type Atom, type WritableAtom } from 'jotai'
import type {
  INTERNAL_ChangedAtoms as ChangedAtoms,
  INTERNAL_StoreHooks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai/vanilla/utils/atomFamily'

export type ScopedStore = Store

export type AnyAtom = Atom<any> | AnyWritableAtom

export type AnyAtomFamily = AtomFamily<any, AnyAtom>

export type AnyWritableAtom = WritableAtom<any, any[], any>

export type Scope = {
  /**
   * Returns a scoped atom from the original atom.
   * @param anAtom
   * @param implicitScope the atom is implicitly scoped in the provided scope
   * @returns the scoped atom and the scope of the atom
   */
  getAtom: <T extends AnyAtom>(anAtom: T, implicitScope?: Scope) => [T, Scope?]

  /**
   * Cleans up the scope
   */
  cleanup: () => void

  /**
   * @modifies the atom's write function for atoms that can hold a value
   * @returns a function to restore the original write function
   */
  prepareWriteAtom: <T extends AnyAtom>(
    anAtom: T,
    originalAtom: T,
    implicitScope?: Scope,
    writeScope?: Scope
  ) => (() => void) | undefined

  /**
   * The base store (unpatched) that this scope is built on
   */
  baseStore: Store

  /**
   * @debug
   */
  name?: string

  /**
   * @debug
   */
  toString?: () => string
}

/**
 * WeakMap to store the scope associated with each scoped store
 */
export const storeScopeMap = new WeakMap<Store, Scope>()

export type AtomDefault = readonly [AnyWritableAtom, unknown]

export type WithOriginal<T extends AnyAtom> = T & {
  originalAtom: T
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export type StoreHooks = Mutable<Required<INTERNAL_StoreHooks>>

export type StoreHookForAtoms = StoreHooks['c']

export type WeakSetForAtoms = ChangedAtoms

export type WeakMapForAtoms = {
  get(atom: AnyAtom): any
  set(atom: AnyAtom, value: any): void
} & (
  | { has(atom: AnyAtom): boolean; delete(atom: AnyAtom): void }
  | Record<never, never>
)
