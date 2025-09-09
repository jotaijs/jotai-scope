import { INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks } from 'jotai/vanilla/internals'
import type { INTERNAL_Store as Store } from 'jotai/vanilla/internals'
import type {
  AnyAtom,
  AnyWritableAtom,
  BuildingBlocks,
  ScopedStore,
} from './types'

export function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every(b.has.bind(b)))
}

const originalBuildingBlocks = new WeakMap<
  Store | ScopedStore,
  BuildingBlocks
>()

export function setOriginalBuildingBlocks(
  store: Store | ScopedStore,
  buildingBlocks: BuildingBlocks
) {
  originalBuildingBlocks.set(store, buildingBlocks)
}

export function getBaseStoreState(store: Store | ScopedStore): BuildingBlocks {
  return [
    ...(originalBuildingBlocks.get(store) ?? getBuildingBlocks(store)),
  ] as BuildingBlocks
}

export function toNameString(this: { name: string }) {
  return this.name
}

export function isWritableAtom(atom: AnyAtom): atom is AnyWritableAtom {
  return 'write' in atom
}
