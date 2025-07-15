import type { Atom, WritableAtom } from 'jotai/vanilla'
import {
  INTERNAL_getBuildingBlocksRev1 as INTERNAL_getBuildingBlocks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai/vanilla/utils/atomFamily'

export type ScopedStore = Store & { [SCOPE]: Scope }

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
   * @debug
   */
  name?: string

  /**
   * @debug
   */
  toString?: () => string
}

export const SCOPE = Symbol('scope')

export type AtomDefault = readonly [AnyWritableAtom, unknown]

export type CloneAtom<T extends AnyAtom> = T & {
  /** original atom */
  o: T
  /** clone type */
  x: EXPLICIT | CONSUMER | undefined
}

export const EXPLICIT = Symbol('explicit')
export const CONSUMER = Symbol('consumer')
export type EXPLICIT = typeof EXPLICIT
export type CONSUMER = typeof CONSUMER

type Mutable<T> = {
  -readonly [K in keyof T]: T[K]
}
export type BuildingBlocks = Partial<
  Mutable<ReturnType<typeof INTERNAL_getBuildingBlocks>>
>
