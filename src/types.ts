import { type Atom, type WritableAtom } from 'jotai'
import type {
  INTERNAL_StoreHooks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai-family'

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

export type Scope = [
  explicitMap: ExplicitMap,
  implicitMap: ImplicitMap,
  inheritedSource: InheritedSource,
  baseStore: Store,
  parentScope: Scope | undefined,
  cleanupFamiliesSet: CleanupFamiliesSet,
  scopedStore: Store,
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

export type WeakMapLike<K extends object, V> = {
  get(key: K): V | undefined
  set(key: K, value: V): void
  has(key: K): boolean
  delete(key: K): boolean
}
export type SetLike<T> = {
  readonly size: number
  add(value: T): void
  has(value: T): boolean
  delete(value: T): boolean
  clear(): void
  forEach(callback: (value: T) => void): void
  [Symbol.iterator](): IterableIterator<T>
}
