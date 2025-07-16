import { type Atom, type WritableAtom, createStore } from 'jotai/vanilla'
import type { INTERNAL_getBuildingBlocksRev1 as INTERNAL_getBuildingBlocks } from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai/vanilla/utils/atomFamily'

export type Store = ReturnType<typeof createStore>

export type ScopedStore = Store & {
  [SCOPE]: Scope
  [ORIGINAL_BUILDING_BLOCKS]: BuildingBlocks
}

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

export const ORIGINAL_BUILDING_BLOCKS = Symbol('originalBuildingBlocks')

export type AtomDefault = readonly [AnyWritableAtom, unknown]

export type WithOriginal<T extends AnyAtom> = T & {
  originalAtom: T
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] }
export type BuildingBlocks = Mutable<
  ReturnType<typeof INTERNAL_getBuildingBlocks>
>
export type StoreHooks = Mutable<BuildingBlocks[6]>
export type StoreHookForAtoms = NonNullable<StoreHooks['c']>
export type WeakSetForAtoms = Mutable<BuildingBlocks[3]>
export type WeakMapForAtoms = {
  get(atom: AnyAtom): any
  set(atom: AnyAtom, value: any): void
} & (
  | { has(atom: AnyAtom): boolean; delete(atom: AnyAtom): void }
  | Record<never, never>
)
