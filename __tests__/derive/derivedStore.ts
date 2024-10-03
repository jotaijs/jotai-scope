import { createStore as baseCreateStore } from 'jotai'
import { createScope } from 'src/ScopeProvider2/scope'
import type { AnyAtomFamily, AnyAtom } from 'src/ScopeProvider2/types'

export function createStore(
  atoms: Set<AnyAtom> = new Set(),
  atomFamilies: Set<AnyAtomFamily> = new Set(),
  baseStore = baseCreateStore(),
  debugName: string | undefined = undefined,
) {
  const { store: derivedStore } = createScope(atoms, atomFamilies, baseStore, debugName)
  return derivedStore
}

const store = createStore()

export function getDefaultStore() {
  return store
}
