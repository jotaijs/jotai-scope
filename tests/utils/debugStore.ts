import type { INTERNAL_BuildingBlocks, INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'
import { createScope } from 'jotai-scope'
import { AnyAtom, AnyWritableAtom } from 'src/types'
import { cross } from './index'

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<INTERNAL_BuildingBlocks>

type DebugStore = Store & { name: string }

export function getAtomLabel(atom: AnyAtom) {
  return (atom.debugLabel ?? String(atom)).replace(/@S(\d+)(->\S+)?$/, '$1').replace(/[^a-zA-Z0-9_]/g, '$')
}

export function createDebugStore(name: string = `S0`): DebugStore {
  const buildingBlocks: Partial<BuildingBlocks> = []
  const atomStateMap = (buildingBlocks[0] = new Map())
  const mountedMap = (buildingBlocks[1] = new Map())
  const storeHooks = (buildingBlocks[6] = initializeStoreHooks({}))

  storeHooks.i.add(undefined, (atom) => {
    const label = getAtomLabel(atom)
    atom.toString = function toString() {
      return label
    }
    namePrototype(atom, label)
    const atomState = atomStateMap.get(atom)!
    Object.assign(atomState, { label })
  })
  storeHooks.m.add(undefined, (atom) => {
    const label = getAtomLabel(atom)
    const mounted = mountedMap.get(atom)!
    Object.assign(mounted, { label })
  })
  const debugStore = buildStore(...buildingBlocks) as DebugStore
  debugStore.name = name
  namePrototype(debugStore, name)
  return debugStore
}

export function createScopes<T extends AnyAtom[][]>(
  ...scopesAtoms: T
): [
  Store,
  ...{
    [K in keyof T]: T[K] extends AnyAtom[] ? Store : never
  },
] {
  const store = createDebugStore()
  Object.assign(store, { name: 'S0' }, store)
  return scopesAtoms.reduce(
    (scopes, atoms, i) => {
      const name = `S${i + 1}`
      const scope = createScope({ atoms, parentStore: scopes[i], name })
      namePrototype(scope, name)
      scopes.push(scope)
      return scopes
    },
    [store] as Store[]
  ) as any
}

export function hydrateScopes<T extends [AnyAtom, ...unknown[]][][]>(scopes: Store[], ...scopesAtomTuples: T) {
  cross(scopes, scopesAtomTuples, (scope, scopeAtomTuples) =>
    scopeAtomTuples.forEach(([atom, value]) =>
      scope.set(atom as AnyWritableAtom, ...(Array.isArray(value) ? value : [value]))
    )
  )
}

export function namePrototype(obj: object, name: string) {
  const p = new Function(`return function ${name}(){}`)()
  Object.setPrototypeOf(obj, p.prototype)
  return p
}
