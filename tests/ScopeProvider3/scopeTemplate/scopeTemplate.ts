import { createScope } from 'src/ScopeProvider3/scope'
import type {
  AnyAtom,
  AnyWritableAtom,
  AtomState,
  Store,
} from 'src/ScopeProvider3/types'
import { type Atom, atom, createStore } from '../../../jotai'
import { atomWithReset } from '../../../jotai/utils'
import { NamedStore } from '../utils'
import type { BuildAtomTypes, ExtractAtomDefs, ExtractScopes } from './types'

type WithAtomStateMap<T> = T & { atomStateMap: Map<AnyAtom, AtomState> }

/**
 * Parses a string representing atom dependencies in nested scopes,
 * and constructs atoms, scopes with their corresponding atom state maps.
 *
 * @param {string} scopeDescription - The template strings array.
 * @example
 * const { atoms, scopes } = scopeTemplate(`
 *   a, b(a)
 *   S0[ ]: a0, b0(a0)
 *   S1[b]: a0, b1(a1)
 * `);
 * @returns {Object} { atoms: { a, b }, scopes: { S0, S1 } }
 */
export function scopeTemplate<
  T extends string,
  Defs extends string[] = ExtractAtomDefs<T>,
  Scopes extends string[] = ExtractScopes<T>,
>(scopeDescription: T) {
  const lines = scopeDescription
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  // First line defines the atoms and their dependencies
  const atoms = parseAtomsLine<Defs>(lines.shift()!)
  type Atoms = typeof atoms
  const scopes = {} as { [K in Scopes[number]]: NamedStore }
  // Parse scopes
  let scopeNumber = 0

  if (lines[0]?.match(/^S0/i)) {
    lines.shift()
  }
  const baseStore = createBaseStore('S' + scopeNumber++)
  let currentStore: Store = (scopes[baseStore.name as Scopes[number]] =
    baseStore)

  for (const line of lines) {
    const match = line.match(/^\w+\[(.*)\]:\s*.*$/)![1]!
    if (!match) {
      throw new Error(`Invalid scope line: ${line}`)
    }
    const scopedAtoms = new Set(
      match
        .split(',')
        .map((s) => atomByName(s as keyof Atoms, atoms) as AnyAtom)
    )
    const store = createScopedStore(
      'S' + scopeNumber++,
      scopedAtoms,
      currentStore
    )
    currentStore = scopes[store.name as Scopes[number]] = store
  }

  function getAtoms(store: Store, atomList: AnyAtom[] = Object.values(atoms)) {
    return atomList.map(store.get)
  }
  function reset(store: WithAtomStateMap<any>) {
    store.atomStateMap.clear()
  }
  function resetAll() {
    for (const store of Object.values(scopes)) {
      reset(store)
    }
  }

  return { atoms, scopes, getAtoms, reset, resetAll }
}

function createScopedStore(
  name: string,
  scopedAtoms: Set<AnyAtom>,
  currentStore: Store
): WithAtomStateMap<NamedStore> {
  const { store, atomStateMap } = createScope(
    scopedAtoms,
    new Set(),
    currentStore,
    name
  )
  return Object.assign(store, { atomStateMap })
}

function createBaseStore(name: string = 'S0') {
  const atomStateMap = new Map<AnyAtom, AtomState>()
  const s0Store = createStore().unstable_derive((_, ...traps) => {
    return [
      function getAtomState<Value>(a: Atom<Value>) {
        let atomState = atomStateMap.get(a) as AtomState<Value> | undefined
        if (!atomState) {
          atomState = { d: new Map(), p: new Set(), n: 0 }
          atomStateMap.set(a, atomState)
        }
        return atomState
      },
      ...traps,
    ]
  }) as WithAtomStateMap<NamedStore>
  return Object.assign(s0Store, { name, atomStateMap })
}

function parseAtomsLine<Defs extends string[]>(line: string) {
  // Split by commas
  const atomDefs = line.split(',').map((s) => s.trim())
  const atoms = {} as BuildAtomTypes<Defs>
  for (const atomDef of atomDefs) {
    const { name, deps } = parseAtomDef(atomDef, atoms)
    Object.assign(atoms, { [name]: createAtom(name, deps) })
  }
  return atoms
}

function parseAtomDef(atomDef: string, atoms: Record<string, AnyAtom>) {
  // atomDef is something like 'a' or 'b(a)'
  const match = atomDef.match(/^(\w+)(?:\((.*)\))?$/)
  if (!match) {
    throw new Error(`Invalid atom definition: ${atomDef}`)
  }
  const name = match[1]!
  const deps: AnyAtom[] = match[2]
    ? match[2]
        .split('+')
        .map((s) => s.trim())
        .map((s) => parseAtomDef(s, atoms))
        .map((def) => atomByName(def.name, atoms))
    : []
  return { name, deps }
}

function createAtom(name: string, deps: AnyAtom[]) {
  // Create atoms based on their dependencies
  let atomInstance
  if (deps.length === 0) {
    atomInstance = atomWithReset<string>(name)
  } else if (deps.length === 1) {
    atomInstance = atom(
      (get) => get(deps[0]!),
      (_get, set, ...args) => set(deps[0]! as AnyWritableAtom, ...args)
    )
  } else {
    atomInstance = atom((get) =>
      deps.reduce((acc, depName) => acc + get(depName), '')
    )
  }
  atomInstance.debugLabel = name
  return atomInstance
}

function atomByName<Atoms extends Record<string, AnyAtom>>(
  name: keyof Atoms,
  atoms: Atoms
) {
  return atoms[name] as AnyAtom
}
