import { fireEvent } from '@testing-library/react'
import type {
  INTERNAL_BuildingBlocks,
  INTERNAL_Store as Store,
} from 'jotai/vanilla/internals'
import {
  INTERNAL_buildStoreRev2 as buildStore,
  INTERNAL_getBuildingBlocksRev2 as getBuildingBlocks,
  INTERNAL_initializeStoreHooksRev2 as initializeStoreHooks,
} from 'jotai/vanilla/internals'

//
// Debug Store
//

type Mutable<T> = { -readonly [P in keyof T]: T[P] }

type BuildingBlocks = Mutable<INTERNAL_BuildingBlocks>

type DebugStore = Store & {
  name: string
  state: {
    atomStateMap: BuildingBlocks[0]
    mountedMap: BuildingBlocks[1]
    invalidatedAtoms: BuildingBlocks[2]
    changedAtoms: BuildingBlocks[3]
    mountCallbacks: BuildingBlocks[4]
    unmountCallbacks: BuildingBlocks[5]
    storeHooks: BuildingBlocks[6]
  }
}

let storeId = 0
export function createDebugStore(
  name: string = `debug${storeId++}`
): DebugStore {
  const buildingBlocks: BuildingBlocks = [...getBuildingBlocks(buildStore())]
  const ensureAtomState = buildingBlocks[11]
  buildingBlocks[11] = (store, atom) =>
    Object.assign(ensureAtomState(store, atom), { label: atom.debugLabel })
  const debugStore = buildStore(...buildingBlocks) as DebugStore
  debugStore.name = name
  debugStore.state = {
    atomStateMap: buildingBlocks[0],
    mountedMap: buildingBlocks[1],
    invalidatedAtoms: buildingBlocks[2],
    changedAtoms: buildingBlocks[3],
    mountCallbacks: buildingBlocks[4],
    unmountCallbacks: buildingBlocks[5],
    storeHooks: initializeStoreHooks(buildingBlocks[6]),
  }
  return debugStore
}

function getElements(
  container: HTMLElement,
  querySelectors: string[]
): Element[] {
  return querySelectors.map((querySelector) => {
    const element = container.querySelector(querySelector)
    if (!element) {
      throw new Error(`Element not found: ${querySelector}`)
    }
    return element
  })
}

export function getTextContents(
  container: HTMLElement,
  selectors: string[]
): string[] {
  return getElements(container, selectors).map(
    (element) => element.textContent!
  )
}

export function clickButton(container: HTMLElement, querySelector: string) {
  const button = container.querySelector(querySelector)
  if (!button) {
    throw new Error(`Button not found: ${querySelector}`)
  }
  fireEvent.click(button)
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
