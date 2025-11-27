import { type Atom, type WritableAtom } from 'jotai'
import type {
  INTERNAL_ChangedAtoms as ChangedAtoms,
  INTERNAL_StoreHooks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai/vanilla/utils/atomFamily'

export type AnyAtom = Atom<any> | AnyWritableAtom

export type AnyAtomFamily = AtomFamily<any, AnyAtom>

export type AnyWritableAtom = WritableAtom<any, any[], any>

/** WeakMap-like, but each value must be [same A as key, Scope?] */
export type AtomPairMap = {
  set<A extends AnyAtom>(key: A, value: [A, Scope?]): AtomPairMap
  get<A extends AnyAtom>(key: A): [A, Scope?] | undefined
  has(key: AnyAtom): boolean
  delete(key: AnyAtom): boolean
}

export interface ExplicitMap extends AtomPairMap {}

export interface ImplicitMap extends AtomPairMap {}

export type InheritedSource = WeakMap<Scope | object, AtomPairMap>

export type CleanupFamiliesSet = Set<() => void>

export interface DependentMap extends AtomPairMap {}

export type Scope = [
  explicitMap: ExplicitMap, //               0
  implicitMap: ImplicitMap, //               1
  dependentMap: DependentMap, //             2
  inheritedSource: InheritedSource, //       3
  baseStore: Store, //                       4
  parentScope: Scope | undefined, //         5
  cleanupFamiliesSet: CleanupFamiliesSet, // 6
  scopedStore: Store, //                     7
] & {
  /** @debug */
  name?: string
  /** @debug */
  toString?: () => string
}

export type AtomDefault = readonly [AnyWritableAtom, unknown]

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export type StoreHooks = Mutable<INTERNAL_StoreHooks>

export type StoreHookForAtoms = NonNullable<StoreHooks['c']>

export type WeakSetForAtoms = ChangedAtoms

export type WeakMapForAtoms = {
  get(atom: AnyAtom): any
  set(atom: AnyAtom, value: any): void
} & (
  | { has(atom: AnyAtom): boolean; delete(atom: AnyAtom): void }
  | Record<never, never>
)
