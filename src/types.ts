import { type Atom, type WritableAtom } from 'jotai'
import type { INTERNAL_StoreHooks, INTERNAL_Store as Store } from 'jotai/vanilla/internals'
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

export interface DependentMap extends AtomPairMap {}

/** Map of proxy atoms to the set of listeners subscribed in this scope */
export type ScopeListenersMap = WeakMap<AnyAtom, Set<() => void>>

export type Scope = [
  explicitMap: ExplicitMap, //             0
  implicitMap: ImplicitMap, //             1
  dependentMap: DependentMap, //           2
  inheritedSource: InheritedSource, //     3
  baseStore: Store, //                     4
  parentScope: Scope | undefined, //       5
  cleanupListeners: StoreHookWithOnce, //  6
  scopedStore: Store, //                   7
  scopeListenersMap: ScopeListenersMap, // 8
] & {
  /** @debug */
  name?: string
  /** @debug */
  toString?: () => string
}

export type AtomDefault = readonly [AnyWritableAtom, unknown]

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

export type StoreHooks = Mutable<INTERNAL_StoreHooks>

type StoreHook = NonNullable<StoreHooks['f']>

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

export type StoreHookWithOnce = StoreHook & {
  once: (callback: () => void) => void
}
