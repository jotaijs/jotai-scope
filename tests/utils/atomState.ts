import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_BuildingBlocks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'
import { AnyAtom } from 'src/types'
import { createDiffer } from './diff'
import chalk from 'chalk'
import { leftpad } from './leftpad'

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<INTERNAL_BuildingBlocks>

const atomStateDiffer = createDiffer()

function _printAtomState(store: Store) {
  let buildingBlocks = getBuildingBlocks(store)
  function resolveEnhancer(bb: Readonly<BuildingBlocks>) {
    return bb[24]?.(bb)
  }
  while (resolveEnhancer(buildingBlocks)) {
    buildingBlocks = resolveEnhancer(buildingBlocks)!
  }
  if (buildingBlocks[0] instanceof WeakMap) {
    throw new Error('Cannot print atomStateMap, store must be debug store')
  }
  const atomStateMap = buildingBlocks[0] as Map<AnyAtom, AtomState>
  const result: string[] = []
  function printAtom(atom: AnyAtom, indent = 0) {
    const atomState = atomStateMap.get(atom)
    if (!atomState) return
    const prefix = '  '.repeat(indent)
    const label = atom.debugLabel || String(atom)
    const value = atomState?.v ?? 'undefined'
    result.push(`${prefix}${label}: v=${value}`)
    if (atomState?.d) {
      const deps = [...atomState.d.keys()]
      if (deps.length > 0) {
        deps.forEach((depAtom) => printAtom(depAtom, indent + 1))
      }
    }
  }
  Array.from(atomStateMap.keys(), (atom) => printAtom(atom))
  return result.join('\n')
}

type PrintAtomStateFn = {
  (store: Store): string
  diff: (store: Store) => string
  clearDiff: () => void
}

export const printAtomState: PrintAtomStateFn = Object.assign(
  (store: Store) => _printAtomState(store),
  {
    diff: (store: Store) => atomStateDiffer(_printAtomState(store)),
    clearDiff: () => {
      atomStateDiffer.previous = null
    },
  }
)

export function trackAtomStateMap(store: Store) {
  const buildingBlocks = getBuildingBlocks(store)
  if (buildingBlocks[0] instanceof WeakMap) {
    throw new Error('Cannot print atomStateMap, store must be debug store')
  }
  const storeHooks = buildingBlocks[6]

  storeHooks.c!.add(undefined, (atom) => {
    console.log('ATOM_CHANGED', atom.debugLabel)
    console.log(leftpad(printAtomState.diff(store)))
  })
}
