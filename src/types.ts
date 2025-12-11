import { type Atom, type WritableAtom } from 'jotai'
import type { INTERNAL_StoreHooks, INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import type { AtomFamily } from 'jotai-family'

export type AnyAtom = Atom<any> | AnyWritableAtom

export type AnyAtomFamily = AtomFamily<any, AnyAtom>

export type AnyWritableAtom = WritableAtom<any, any[], any>

/** A scoped copy of an atom with scope metadata */
export type ScopedAtom<T extends AnyAtom = AnyAtom> = T & {
  /**
   * The scope level of this atom for O(1) lookup when computing dependent scoping.
   * - Explicitly scoped atoms: equals the scope's level (scope[9])
   * - Dependently scoped atoms: equals the max scope level of their scoped dependencies
   */
  __scopeLevel: number
  /**
   * Reference to the original unscoped atom. Used to look up the scoped version
   * in explicit/dependent maps when computing max dependency level.
   */
  __originalAtom: AnyAtom
  /**
   * Reference to the inherited atom at the current scope level.
   * Updated when scope level changes.
   */
  __inheritedAtom?: AnyAtom
}

/** WeakMap-like, but each value must be [same A as key, Scope?] */
export type AtomPairMap = {
  set<A extends AnyAtom>(key: A, value: [A, Scope?]): AtomPairMap
  get<A extends AnyAtom>(key: A): [A, Scope?] | undefined
  has(key: AnyAtom): boolean
  delete(key: AnyAtom): boolean
}

export type AtomPairScopedMap = {
  set<A extends AnyAtom>(key: A, value: [ScopedAtom<A>, Scope?]): AtomPairMap
  get<A extends AnyAtom>(key: A): [ScopedAtom<A>, Scope?] | undefined
  has(key: AnyAtom): boolean
  delete(key: AnyAtom): boolean
}

export interface ExplicitMap extends AtomPairScopedMap {}

export interface ImplicitMap extends AtomPairScopedMap {}

export type InheritedSource = WeakMap<Scope | object, AtomPairMap>

export interface DependentMap extends AtomPairScopedMap {}

/** Map of proxy atoms to the set of listeners subscribed in this scope */
export type ScopeListenersMap = WeakMap<AnyAtom, Set<() => void>>

/** Map of base atoms to their multi-stable scoped atoms */
export type MultiStableMap = WeakMap<AnyAtom, ScopedAtom>

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
  level: number, //                        9
  multiStableMap: MultiStableMap, //       10
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
