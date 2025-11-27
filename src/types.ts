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
  explicitMap: AtomPairMap
  implicitMap: AtomPairMap
  dependentMap: AtomPairMap
  inheritedSource: WeakMap<Scope | object, AtomPairMap>
  baseStore: Store
  parentScope: Scope | undefined
  cleanupFamiliesSet: Set<() => void>
  scopedStore: ScopedStore
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

/** WeakMap-like, but each value must be [same A as key, Scope?] */
export type AtomPairMap = {
  set<A extends AnyAtom>(key: A, value: [A, Scope?]): AtomPairMap
  get<A extends AnyAtom>(key: A): [A, Scope?] | undefined
  has(key: AnyAtom): boolean
  delete(key: AnyAtom): boolean
}

export { storeScopeMap } from './ScopeProvider/scope'
